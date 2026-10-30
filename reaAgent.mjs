// REA as an investigating agent that works the way Claude Code does when coding: it first writes a short PLAN (a to-do list), then works through it
// with tools (several independent lookups at once), explains each move in one line, learns from errors, never repeats a call, compacts its own
// memory when it grows, VERIFIES its draft against the raw evidence, and finishes with a structured report. Every move is also reported through
// onStep() so the chat can show a live progress trail while it works.
// REA as an investigating agent: the AI calls REA's own tools (through MCP) in a loop - open the binary, search, decompile a function,
// trace who calls it, list strings ... - until it can answer. Everything runs inside a throw-away folder; the file is only READ, never run.
//
// Safety (this runs on a public server, so it is strict):
//  * allowlist: only analysis tools. Anything that runs/launches/attaches/captures/fetches a URL/installs/serves is refused by name.
//  * path jail: every path the AI passes must stay inside the work folder (relative paths are rewritten into it); URLs are refused.
//  * limits: max steps, per-call timeout, total time budget, result size, one REA process per request that is killed at the end.
//  * REA runs with a private HOME so it cannot read the server owner's config.
// Env: REA_AGENT=0 (turn the loop off, one-shot analysis only), REA_AGENT_STEPS (14), REA_AGENT_BUDGET_MS (240000), REA_AGENT_CALL_MS (180000).
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { detectKind, prepareTarget, keywordFrom } from './rea.mjs';

const reaLocalBin = () => { try { const p = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules', '.bin', 'rea'); return existsSync(p) ? p : 'rea'; } catch { return 'rea'; } };
const REA_BIN = process.env.REA_BIN || reaLocalBin();
const STEPS = Number(process.env.REA_AGENT_STEPS) || 14;   // max tool calls per investigation
const PARALLEL = 3;                                          // independent read-only calls allowed in one turn
const BUDGET = Number(process.env.REA_AGENT_BUDGET_MS) || 240000;
const CALL_MS = Number(process.env.REA_AGENT_CALL_MS) || 180000;
const RESULT_TO_AI = 6000;      // chars of one tool result shown back to the AI
const EVIDENCE_TOTAL = 24000;   // chars of raw evidence handed to the final answer
export const agentEnabled = () => process.env.REA_AGENT !== '0' && process.env.REA_ENABLED !== '0';

// ---- policy -------------------------------------------------------------------------------------------------------------------
// Names containing any of these are never offered or run (runtime, network, host-changing, long-running servers).
const DENY = /(capture|launch|run_|_run\b|attach|frida|adb|gdb|lldb|browser|process|observe|observation|web_|_web|page|url|http|serve|server|environment|install|setup|update|uninstall|doctor|mcp|provenance|client|device|record_|kill|spawn|exec|shell|network|scenario|replay|inject|patch|write_|rename|apply_)/i;
const ALLOW = /^(open|close|analy[sz]e|inspect|search|list|get|trace|compare|disassemble|decompile|read|find|extract|export|query|lookup|resolve|summari[sz]e|show|describe|binary_session)/i;
export const toolAllowed = (name) => ALLOW.test(name) && !DENY.test(name);

const URLISH = /^[a-z][a-z0-9+.-]*:\/\//i;
const PATH_KEY = /^(path|file|filename|dir|directory|folder|output|archive|snapshot|evidence_output|output_path|input_path|file_path|[a-z_]*_(path|file|dir|output))$/i;

/** Returns args with every path made absolute inside `root`; throws when something points outside it or is a URL. */
export function jailArgs(value, root, key = '') {
  const inside = (p) => { const abs = path.resolve(root, p); if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`path "${p}" is outside the allowed work folder`); return abs; };
  if (typeof value === 'string') {
    if (URLISH.test(value.trim())) throw new Error('URLs are not allowed');
    if (PATH_KEY.test(key) && value.length > 0) return inside(value.replace(/^~/, '__home__')); // a path field: must resolve inside the work folder
    // any other text (a search term such as "/api/login" is fine) but never a way out of the folder or into system folders
    if (/(^|[\\/])\.\.([\\/]|$)/.test(value) || /^[a-z]:[\\/]/i.test(value) || value.startsWith('~/')) throw new Error(`"${value.slice(0, 80)}" looks like a path outside the work folder`);
    if (/^\/(etc|proc|root|home|var|usr|sys|dev|tmp|mnt|opt|bin|sbin|run|srv|boot|lib\w*)(\/|$)/.test(value) && !path.resolve(value).startsWith(root + path.sep)) throw new Error(`"${value.slice(0, 80)}" is outside the work folder`);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => jailArgs(v, root, key));
  if (value && typeof value === 'object') { const o = {}; for (const [k, v] of Object.entries(value)) o[k] = jailArgs(v, root, k); return o; }
  return value;
}

// ---- minimal MCP client (newline-delimited JSON-RPC over stdio; no dependency) ---------------------------------------------------
class Mcp {
  constructor(cmd, args, { cwd, env, signal }) {
    this.id = 0; this.pending = new Map(); this.buf = ''; this.dead = false; this.err = '';
    this.p = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.p.on('error', (e) => this._die(e.code === 'ENOENT' ? 'REA is not installed on this server' : e.message));
    this.p.on('exit', () => this._die('REA stopped'));
    this.p.stdin.on('error', () => {});
    this.p.stderr.on('data', (d) => { this.err = (this.err + d).slice(-2000); });
    this.p.stdout.on('data', (d) => {
      this.buf += d; let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        const w = m.id !== undefined && this.pending.get(m.id);
        if (w) { this.pending.delete(m.id); clearTimeout(w.t); m.error ? w.rej(new Error(m.error.message || 'MCP error')) : w.res(m.result); }
      }
    });
    signal?.addEventListener('abort', () => this.close());
  }
  _die(why) { this.dead = true; for (const [, w] of this.pending) { clearTimeout(w.t); w.rej(new Error(why)); } this.pending.clear(); }
  request(method, params, timeout = CALL_MS) {
    if (this.dead) return Promise.reject(new Error('REA is not running'));
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method} timed out`)); }, timeout);
      this.pending.set(id, { res, rej, t });
      this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method, params) { if (!this.dead) this.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  close() { this.dead = true; try { this.p.stdin.end(); } catch { /* ignore */ } try { this.p.kill('SIGKILL'); } catch { /* ignore */ } }
}

const textOf = (r) => {
  const parts = (r?.content || []).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n');
  return (parts || (r?.structuredContent ? JSON.stringify(r.structuredContent) : '')).trim();
};
const cut = (t, n) => (t.length > n ? t.slice(0, n) + `\n... (${t.length - n} more characters cut; ask a narrower question or use an offset/limit)` : t);

function brief(tool) {
  const props = tool.inputSchema?.properties || {}; const req = new Set(tool.inputSchema?.required || []);
  const fields = Object.keys(props).slice(0, 12).map((k) => (req.has(k) ? `${k}*` : k)).join(', ');
  const d = String(tool.description || '').replace(/\s+/g, ' ').split(/(?<=\.)\s/)[0].slice(0, 140);
  return `- ${tool.name}(${fields}): ${d}`;
}

// ---- Claude-Code-style helpers ------------------------------------------------------------------------------------------------
const MAX_HISTORY_CHARS = 60000;

/** Accepts one JSON action from the AI. Returns { final } or { tools:[{tool,args}], thought, plan, done }. Tolerates code fences and the old {"tool","args"} shape. */
export function parseAction(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return { final: t };
  let o; try { o = JSON.parse(m[0]); } catch { return { final: t }; }
  if (!o || typeof o !== 'object') return { final: t };
  const plan = Array.isArray(o.plan) ? o.plan.map((x) => String(x).slice(0, 140)).slice(0, 8) : undefined;
  const done = Array.isArray(o.done) ? o.done.filter((n) => Number.isInteger(n)) : undefined;
  const thought = typeof o.thought === 'string' ? o.thought.slice(0, 240) : '';
  if (typeof o.final === 'string' && !o.tool && !o.tools) return { final: o.final, plan, done, thought };
  let tools = Array.isArray(o.tools) ? o.tools : (o.tool ? [{ tool: o.tool, args: o.args }] : []);
  tools = tools.filter((x) => x && typeof x.tool === 'string').slice(0, PARALLEL).map((x) => ({ tool: x.tool, args: x.args && typeof x.args === 'object' ? x.args : {} }));
  if (!tools.length) return { final: String(o.final ?? t), plan, done, thought };
  return { tools, thought, plan, done };
}

/** One short human line for a tool call, like Claude Code's "Searching for ..." / "Reading ...". */
export function stepLabel(tool = '', args = {}) {
  const term = String(args.query ?? args.pattern ?? args.term ?? args.text ?? args.name ?? args.symbol ?? args.function ?? args.address ?? '').slice(0, 50);
  const q = term ? ` "${term}"` : '';
  if (/^(open|binary_session)/i.test(tool)) return 'Opening the file';
  if (/^close/i.test(tool)) return 'Closing the file';
  if (/decompile|pseudocode/i.test(tool)) return `Decompiling${q}`;
  if (/disassemble/i.test(tool)) return `Disassembling${q}`;
  if (/^(search|find|lookup|query)/i.test(tool)) return `Searching${q}`;
  if (/trace|xref|call_path|callers|callees/i.test(tool)) return `Tracing who uses${q || ' it'}`;
  if (/compare/i.test(tool)) return 'Comparing';
  if (/string/i.test(tool)) return `Reading strings${q}`;
  if (/import|export/i.test(tool)) return 'Reading imports and exports';
  if (/^(list|get|show)/i.test(tool)) return `Listing ${tool.replace(/^(list|get|show)_?/i, '').replace(/_/g, ' ') || 'items'}`;
  if (/^(analy[sz]e|inspect|describe|summari[sz]e)/i.test(tool)) return `Inspecting (${tool.replace(/_/g, ' ')})`;
  return tool.replace(/_/g, ' ');
}

/** Keeps the AI's memory small: old tool results shrink to one short line; the newest `keep` results stay whole. Returns a new array. */
export function compactHistory(history, keep = 4, limit = MAX_HISTORY_CHARS) {
  const size = () => history.reduce((n, m) => n + m.content.length, 0);
  if (size() <= limit) return history;
  const idx = history.map((m, i) => (m.role === 'user' && /^Result of /.test(m.content) ? i : -1)).filter((i) => i >= 0);
  const old = new Set(idx.slice(0, Math.max(0, idx.length - keep)));
  return history.map((m, i) => (old.has(i) && m.content.length > 500 ? { ...m, content: m.content.slice(0, 380).replace(/\s+/g, ' ') + ' ... (older result shortened; it is still in the evidence)' } : m));
}

const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

const workflowRules = (work, target, kind) => `You are REA, a senior reverse-engineering agent. You work like a careful coding agent: plan, act with tools, check the results, adapt, verify, then report.
The user attached ONE file. It is at: ${target} (${kind}). It is never executed; you only inspect it. Use absolute paths under ${work} only.

Reply with EXACTLY one JSON object per turn and nothing else:
  {"plan":["step 1","step 2",...],"thought":"<one line: why>","tools":[{"tool":"<name>","args":{...}}]}   <- FIRST turn: write a plan of 3-6 short steps, then start step 1
  {"thought":"<one line: what the last result told you and what you do next>","done":[0],"tools":[...]}   <- later turns (done = indexes of plan steps now finished; you may send a new "plan" if the picture changed)
  {"final":"<your findings>"}   <- when you can answer, or more calls would not help
Working rules:
 - Start broad (what is this file, what is in it), then narrow to what the user asked: search, strings, imports, decompile ONE function, trace who calls it.
 - You may put up to ${PARALLEL} independent read-only calls in one "tools" list to save steps. Do not repeat a call you already made.
 - Open the binary with the open/session tool first if the other tools need it. Close it at the end.
 - If a tool errors, read the message, then fix the arguments or choose another tool. Do not retry the same thing blindly.
 - Total budget: ${STEPS} tool calls. Spend them where the user's question is.
 - In "final": concrete facts only (names, addresses, strings, imports, code) each with the tool result it came from as [#n], then what you could NOT determine. Never invent anything a tool did not return.`;

const reportRules = `Write the answer like a good coding agent's final message: lead with the direct answer in 1-3 sentences; then "What I did" (the steps above, one line each); then "What I found" (bullets, each with the name/address/string and its [#n] evidence number); then "How it works" in plain words (only what the evidence supports); then "Could not determine" (honest gaps); then offer 1-2 specific next things you can dig into. Keep it readable, no filler.`;

/**
 * Investigates one attached file with REA's tools, Claude-Code style.
 * askAI(messages, system) -> Promise<string>. onStep(event) is optional live progress.
 * Returns { ok, context, steps, trail }. ok:false + reason when the agent cannot run (caller falls back).
 */
export async function reaInvestigate({ bytes, name = 'file', query = '', askAI, signal, onStep }) {
  const emit = (e) => { try { onStep?.(e); } catch { /* progress is best effort */ } };
  const work = await mkdtemp(path.join(os.tmpdir(), 'reaagent-'));
  const home = path.join(work, '_home'); await mkdir(home, { recursive: true });
  const start = Date.now(); let mcp;
  const trail = [];
  try {
    const kind = await detectKind(bytes, name);
    if (kind === 'unknown') return { ok: false, reason: 'unknown-kind', context: '' };
    emit({ type: 'start', kind, name });
    const target = await prepareTarget(bytes, name, kind, work);
    mcp = new Mcp(REA_BIN, ['mcp'], { cwd: work, signal, env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, NO_COLOR: '1', REA_MCP_INPUT_SCHEMA_PROFILE: 'compact' } });
    await mcp.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'xyron', version: '2.0' } }, 30000);
    mcp.notify('notifications/initialized', {});
    let tools = [], cursor;
    do { const r = await mcp.request('tools/list', cursor ? { cursor } : {}, 30000); tools = tools.concat(r.tools || []); cursor = r.nextCursor; } while (cursor && tools.length < 500);
    const allowed = new Map(tools.filter((t) => toolAllowed(t.name)).map((t) => [t.name, t]));
    if (!allowed.size) return { ok: false, reason: 'no-tools', context: '' };

    const system = `${workflowRules(work, target, kind)}\nAvailable tools (* = required):\n${[...allowed.values()].map(brief).join('\n')}`;
    let history = [{ role: 'user', content: `User question: ${query.slice(0, 1500) || 'Explain what this file is and how it works.'}${keywordFrom(query) ? `\nPossible keyword: ${keywordFrom(query)}` : ''}\nFile kind: ${kind}. Write your plan and make your first move.` }];
    const evidence = []; const cache = new Map(); let plan = []; let finalText = ''; let calls = 0, errStreak = 0, turns = 0;

    const overBudget = () => Date.now() - start > BUDGET;
    const runOne = async ({ tool, args }) => {
      const label = stepLabel(tool, args);
      if (!allowed.has(tool)) return { tool, label, ok: false, out: `ERROR: tool "${tool}" is not available; choose one from the list` };
      let jailed; try { jailed = jailArgs(args || {}, work); } catch (e) { return { tool, label, ok: false, out: `ERROR: ${String(e.message).slice(0, 300)}` }; }
      const key = tool + stable(jailed);
      if (cache.has(key)) return { tool, label, ok: true, repeat: true, out: `(you already made this exact call - see result #${cache.get(key)} above. Use a different tool or narrower arguments.)` };
      const n = ++calls; emit({ type: 'tool', n, tool, label });
      try {
        const left = Math.max(10000, Math.min(CALL_MS, BUDGET - (Date.now() - start)));
        const r = await mcp.request('tools/call', { name: tool, arguments: jailed }, left);
        const txt = textOf(r) || '(empty result)';
        if (r?.isError) { emit({ type: 'result', n, ok: false, label, note: txt.slice(0, 90) }); return { tool, label, n, ok: false, out: `ERROR: ${cut(txt, 1500)}` }; }
        cache.set(key, n); evidence.push({ n, tool, args: jailed, text: txt });
        emit({ type: 'result', n, ok: true, label, note: txt.replace(/\s+/g, ' ').slice(0, 90) });
        return { tool, label, n, ok: true, out: cut(txt, RESULT_TO_AI) };
      } catch (e) { emit({ type: 'result', n, ok: false, label, note: String(e.message).slice(0, 90) }); return { tool, label, n, ok: false, out: `ERROR: ${String(e.message).slice(0, 500)}` }; }
    };

    while (turns < STEPS + 2 && calls < STEPS) {
      if (signal?.aborted) break;
      if (overBudget()) { finalText = finalText || '(time budget reached)'; break; }
      turns++;
      history = compactHistory(history);
      const act = parseAction(await askAI(history, system));
      if (act.plan?.length) { plan = act.plan; emit({ type: 'plan', items: plan }); }
      if (act.done?.length) emit({ type: 'progress', done: act.done, total: plan.length });
      if (act.thought) { emit({ type: 'thought', text: act.thought }); trail.push(`- ${act.thought}`); }
      if (act.final !== undefined) { finalText = String(act.final).slice(0, 8000); break; }
      history.push({ role: 'assistant', content: JSON.stringify({ thought: act.thought, tools: act.tools }) });
      const results = await Promise.all(act.tools.slice(0, Math.max(1, STEPS - calls)).map(runOne));
      if (mcp.dead) { finalText = 'REA stopped while working.'; break; }
      for (const r of results) if (!r.repeat) trail.push(`- ${r.ok ? 'done' : 'failed'}: ${r.label}${r.n ? ` [#${r.n}]` : ''}`);
      errStreak = results.every((r) => !r.ok && !r.repeat) ? errStreak + 1 : 0;
      let note = '';
      if (errStreak === 3) note = '\nSeveral calls failed in a row. Change approach: list what the tools can do on this file first, or give your final answer with what you have.';
      if (errStreak >= 5) { finalText = finalText || '(stopped after repeated tool errors)'; break; }
      const left = STEPS - calls;
      history.push({ role: 'user', content: `${results.map((r) => `Result of ${r.tool}${r.n ? ` [#${r.n}]` : ''}:\n${r.out}`).join('\n\n')}${note}\n\n${left <= 2 ? `Only ${left} tool call(s) left - wrap up. ` : ''}Next JSON action?` });
    }
    if (!finalText && !signal?.aborted && evidence.length) {   // out of steps: ask for the final findings once
      history.push({ role: 'user', content: 'Tool limit reached. Reply now with {"final":"..."} using only what the tools returned.' });
      try { finalText = String(parseAction(await askAI(history, system)).final || '').slice(0, 8000); } catch { /* use raw evidence */ }
    }
    if (!mcp.dead && allowed.has('close_binary')) { try { await mcp.request('tools/call', { name: 'close_binary', arguments: {} }, 5000); } catch { /* best effort */ } }
    if (!evidence.length && !finalText) return { ok: false, reason: 'no-evidence', context: '' };

    // Verification pass (like re-reading a diff before saying "done"): every claim must be backed by a numbered tool result.
    const perItem = Math.max(1500, Math.floor(EVIDENCE_TOTAL / Math.max(1, evidence.length)));
    const raw = evidence.map((e) => `### [#${e.n}] ${e.tool} ${JSON.stringify(e.args).slice(0, 200)}\n${cut(e.text, perItem)}`).join('\n\n');
    if (finalText && evidence.length && !signal?.aborted && BUDGET - (Date.now() - start) > 20000) {
      emit({ type: 'verify' });
      try {
        const v = parseAction(await askAI([{ role: 'user', content: `User question: ${query.slice(0, 600)}\n\nDRAFT FINDINGS:\n${finalText}\n\nRAW EVIDENCE:\n${raw.slice(0, EVIDENCE_TOTAL)}\n\nReview the draft claim by claim against the raw evidence. Remove or soften anything the evidence does not show, fix wrong names/addresses, add [#n] references. Reply {"final":"<corrected findings>"}.` }], 'You are a strict reviewer of reverse-engineering findings. You only keep claims that the raw evidence supports. Reply with exactly one JSON object.'));
        if (v.final && v.final.length > 40) finalText = String(v.final).slice(0, 8000);
      } catch { /* keep the draft */ }
    }
    emit({ type: 'done', steps: evidence.length });
    return { ok: true, steps: evidence.length, trail, context: `\nREA (reverse-engineering toolkit) investigated the attached ${kind.toUpperCase()} file "${name}" statically (it was never run). It planned the work, called ${evidence.length} analysis tool(s) and verified its findings against the evidence.\nPLAN:\n${plan.map((p, i) => `${i + 1}. ${p}`).join('\n') || '(none)'}\nWHAT IT DID:\n${trail.join('\n') || '(none)'}\n${reportRules} Cite names, addresses, strings and code from the evidence with their [#n] numbers, and say clearly what could not be determined. Never invent code, functions or addresses that are not in the evidence.\nVERIFIED FINDINGS:\n${finalText || '(none)'}\n\nRAW EVIDENCE:\n<<<\n${raw}\n>>>` };
  } catch (e) {
    return { ok: false, reason: String(e.message || e).slice(0, 200), context: '' };
  } finally {
    mcp?.close();
    rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

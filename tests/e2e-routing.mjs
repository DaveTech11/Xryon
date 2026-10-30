// End-to-end routing check against the REAL server.mjs with local mock providers (no internet, no real keys).
// Run: node tests/e2e-routing.mjs
// It boots server.mjs in a temp folder with a seeded free user and premium user, points every existing provider
// (Nexus AI, Vortyx Pulse, the free api-rebix endpoints; OpenAI is no longer used - every chat request asks Nexus first) at a mock that names itself in its reply, then checks that
// each request reached the intended provider.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const SERVER = path.resolve('server.mjs');
const MOCK_PORT = 4911, APP_PORT = 4912;
const hits = [];
const nexusBodies = [];
const mock = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const name = u.pathname.replace(/^\/+/, '').replace(/^api\//, '').replace(/^v1\//, '');
  hits.push(name);
  let body = ''; for await (const c of req) body += c;
  const reply = `MOCK:${name}`;
  if (name === 'nexus') {
    let b = {}; try { b = JSON.parse(body); } catch {}
    nexusBodies.push(b);
    if (b.stream === true && globalThis.NEXUS_SSE !== false) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const piece of ['MOCK:', 'nexus']) { res.write(`data: ${JSON.stringify({ delta: piece })}\n\n`); await new Promise((r) => setTimeout(r, 30)); }
      res.write('data: [DONE]\n\n'); return res.end();
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(/chat$|nexus$/.test(name) ? { output: reply } : { reply }));
});
await new Promise((r) => mock.listen(MOCK_PORT, r));

const dir = mkdtempSync(path.join(tmpdir(), 'xyron-e2e-'));
mkdirSync(path.join(dir, 'data'));
const mkUser = (id, email) => ({ id, email, full_name: id, role: 'user', emailVerified: true, created_date: new Date().toISOString() });
writeFileSync(path.join(dir, 'data', 'xyron.json'), JSON.stringify({
  users: [mkUser('free1', 'free@test.dev'), mkUser('prem1', 'prem@test.dev')],
  sessions: [{ id: 'S_FREE', userId: 'free1' }, { id: 'S_PREM', userId: 'prem1' }],
  subscriptions: [{ id: 's1', userId: 'prem1', status: 'active', tier: 'premium' }],
  files: [{ id: 'doc1', userId: 'prem1', mime: 'application/pdf', name: 'report.pdf', size: 1000, path: '/nonexistent' }],
  conversations: [], messages: [], usage: [], memories: [], settings: {},
}));

const M = `http://127.0.0.1:${MOCK_PORT}`;
const logs = [];
const srv = spawn('node', [SERVER], {
  cwd: dir,
  env: { PATH: process.env.PATH, ANTISCRAPE: 'off', PORT: String(APP_PORT), REBIX_API_BASE: `${M}/api`, GPTLOGIC_API_URL: `${M}/api/gptlogic`,
    NEXUS_API_URL: `${M}/nexus`, NEXUS_API_KEY: 'test', VORTYX_API_URL: `${M}/vortyx/v1`, VORTYX_API_KEY: 'test',
    FREE_AI_SWITCH_MS: '1500', RATE_LIMIT_PER_MINUTE: '1000' },
});
srv.stdout.on('data', (d) => logs.push(String(d))); srv.stderr.on('data', (d) => logs.push(String(d)));
const stop = () => { srv.kill(); mock.close(); };
process.on('exit', stop);

for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/auth/me`); if (r.status === 401 || r.status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

async function chat(session, model, text, extra = {}) {
  hits.length = 0;
  const t0 = Date.now();
  const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/functions/xryonChat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `xyron_session=${session}` },
    body: JSON.stringify({ messages: Array.isArray(text) ? text : [{ role: 'user', content: text }], ui_model: model, persona: '', system_prompt: '', ...extra }),
  });
  const j = await r.json();
  return { status: r.status, ms: Date.now() - t0, ...j };
}

const results = [];
async function check(label, session, model, text, expect, extra) {
  const r = await chat(session, model, text, extra);
  const ok = r.status === 200 && r.reply === `MOCK:${expect.provider}` && (expect.tier === undefined ? !r.route : r.route?.model === expect.tier) && (expect.auto === undefined || r.route?.auto === expect.auto) && (expect.route === undefined || r.route?.id === expect.route) && (expect.web === undefined || Boolean(r.webSearch) === expect.web);
  results.push({ label, ok, got: `${r.reply || r.error} via ${r.route?.model || '(no NEXUS route)'}${r.route?.kind ? ` [${r.route.kind} L${r.route.level}]` : ''}${r.webSearch ? ' +web' : ''} ${r.ms}ms`, want: `MOCK:${expect.provider} via ${expect.tier || '(no NEXUS route)'}` });
  return r;
}

const P = 'S_PREM', F = 'S_FREE', AUTO = 'Xyron Nexus Auto';
await check('AUTO greeting (premium)            ', P, AUTO, 'Hi 👋', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini', auto: true, web: false, route: 'fast_chat' });
await check('AUTO simple question (premium)     ', P, AUTO, 'What is the capital of France?', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini' });
await check('AUTO general explanation (premium) ', P, AUTO, 'Explain what an API is', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini', route: 'general_chat' });
await check('AUTO writing request (premium)     ', P, AUTO, 'Write an email to my landlord asking to fix the heater', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini' });
await check('AUTO python request (premium)      ', P, AUTO, 'Write a Python script to rename files', { provider: 'nexus', tier: 'Xyron Nexus V1 Pro', route: 'coding' });
await check('AUTO JS debugging (premium)        ', P, AUTO, "Debug this JavaScript error: TypeError: Cannot read properties of undefined (reading 'map')", { provider: 'nexus', tier: 'Xyron Nexus V1 Pro' });
await check('AUTO complex reasoning (premium)   ', P, AUTO, 'Solve this complex problem: prove that the sum of the first n odd numbers is n^2', { provider: 'nexus', tier: 'Xyron Nexus V0 Pro', route: 'reasoning' });
await check('AUTO web research (premium)        ', P, AUTO, 'Research the latest developments in AI', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini', web: true, route: 'web_research' });
await check('AUTO uploaded document (premium)   ', P, AUTO, 'analyze this', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini', route: 'file_processing' }, { file_urls: ['/api/files/doc1'] });
await check('AUTO picture request (premium)     ', P, AUTO, 'draw a logo for my coffee shop', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini', web: false, route: 'image_generation' });
await check('AUTO python request (FREE user)    ', F, AUTO, 'Write a Python script to rename files', { provider: 'nexus', tier: 'Xyron Code' });
await check('AUTO complex reasoning (FREE user) ', F, AUTO, 'Solve this complex problem: prove that the sum of the first n odd numbers is n^2', { provider: 'nexus', tier: 'Xyron Reason' });
await check('AUTO explanation (FREE user)       ', F, AUTO, 'Explain what an API is', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini' });
await check('MANUAL Xyron Nexus V0 Mini keeps choice  ', P, 'Xyron Nexus V0 Mini', 'Write a Python script to rename files', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini', auto: false });
await check('MANUAL Xyron Nexus V1 Pro (premium)      ', P, 'Xyron Nexus V1 Pro', 'Hello', { provider: 'nexus', tier: 'Xyron Nexus V1 Pro', auto: false });
await check('MANUAL Xyron Nexus V1 Pro locked (free)  ', F, 'Xyron Nexus V1 Pro', 'Hello', { provider: 'nexus' });
await check('MANUAL legacy Xyron Code untouched ', F, 'Xyron Code', 'Hello', { provider: 'nexus' });
await check('MANUAL legacy Xyron Plus untouched ', F, 'Xyron Plus', 'Hello', { provider: 'nexus' });
// "Build me ..." in normal chat (codex_build): goes to the Xyron Nexus coding tier whichever model is selected; free users get Xyron Code.
await check('BUILD on Xyron Plus (premium)      ', P, 'Xyron Plus', 'build me a telegram bot', { provider: 'nexus', tier: 'Xyron Nexus V1 Pro' }, { codex_build: true });
await check('BUILD on Xyron Plus (FREE user)    ', F, 'Xyron Plus', 'build me a telegram bot', { provider: 'nexus', tier: 'Xyron Code' }, { codex_build: true });
await check('BUILD keeps manual V0 Mini choice  ', P, 'Xyron Nexus V0 Mini', 'build me a telegram bot', { provider: 'nexus', tier: 'Xyron Nexus V0 Mini', auto: false }, { codex_build: true });
await check('LEGACY saved name NEXUS V1 PRO     ', P, 'NEXUS V1 PRO', 'Hello', { provider: 'nexus', tier: 'Xyron Nexus V1 Pro', auto: false });

// streaming: Xyron Nexus V1 Pro over SSE must deliver the text in pieces, send the model id, and arrive complete
{
  const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/functions/xryonChat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'xyron_session=S_PREM' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Write a Python script to rename files' }], ui_model: 'Xyron Nexus Auto', stream: true }) });
  const text = await r.text();
  const pieces = [...text.matchAll(/data: (\{"t":[^\n]*\})/g)].map((m) => JSON.parse(m[1]).t);
  const done = JSON.parse(([...text.matchAll(/data: (\{"done":[^\n]*\})/g)].pop() || [])[1] || '{}');
  results.push({ label: 'Nexus streams in pieces (SSE)     ', ok: pieces.length >= 2 && pieces.join('') === 'MOCK:nexus' && done.reply === 'MOCK:nexus' && nexusBodies.at(-1)?.model === 'nexus-1-pro-flagship' && nexusBodies.at(-1)?.stream === true, got: `${pieces.length} pieces ${JSON.stringify(pieces)}, model sent ${nexusBodies.at(-1)?.model}`, want: '>=2 pieces, MOCK:nexus' });
  globalThis.NEXUS_SSE = false; // endpoint that ignores stream and returns one JSON reply
  const r2 = await fetch(`http://127.0.0.1:${APP_PORT}/api/functions/xryonChat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'xyron_session=S_PREM' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Write a Python script to rename files' }], ui_model: 'Xyron Nexus V1 Pro', stream: true }) });
  const t2 = await r2.text();
  results.push({ label: 'Nexus plain JSON reply still works', ok: /"t":"MOCK:nexus"/.test(t2) && /"done":true/.test(t2), got: t2.slice(0, 80).replace(/\n/g, ' '), want: 'whole text then done' });
}

// history trimming: 30 earlier messages + a greeting must not send them all
{
  const hist = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })).concat([{ role: 'user', content: 'Hi' }]);
  const r = await chat(P, AUTO, hist);
  const line = logs.join('').split('\n').filter((l) => l.includes('[route] AUTO') && l.includes('history')).pop() || '';
  results.push({ label: 'AUTO greeting trims history       ', ok: /history [1-6]\/31/.test(line), got: line.replace(/^.*history/, 'history'), want: 'history <=6/31' });
}

console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label} -> ${r.got}${r.ok ? '' : `   (wanted ${r.want})`}`);
console.log('\nServer routing log:\n' + logs.join('').split('\n').filter((l) => l.startsWith('[route]')).slice(0, 60).join('\n'));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
stop();
process.exit(failed ? 1 : 0);

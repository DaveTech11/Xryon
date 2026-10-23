import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUp, Check, ChevronDown, Clock, Download, FileArchive, FileCode2, Globe, Loader2, Menu, Upload,
  MessageSquare, Play, Rocket, Square, SquarePen, Terminal, AlertTriangle, Sparkles,
} from "lucide-react";
import { api } from "../../../api/client";
import { streamChat } from "./codexStream";
import MarkdownText from "../MarkdownText";
import CodeSandbox, { buildDoc } from "../CodeSandbox";
import CodexRail from "./CodexRail";
import { useKeyboardInset } from "../../../hooks/use-keyboard-inset";
import {
  BUILD_SYSTEM_PROMPT, buildUserMessage, buildContinueMessage, buildRepairMessage, buildRuntimeFixMessage, replyGaps, checkProject,
  parseBuildReply, parseLive, mergeFiles, checkFile, prepareSandbox, zipProject, saveBlob, saveTextFile, formatSize, isRunIntent, slugify,
} from "./codexBuild";
import { importFiles } from "./codexImport";
import { runHeadless, canAutoRun } from "./codexRun";

const sleepRaw = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let turnSeq = 1;

// ----------------------------------------------------------------------------
// One line of the build log: status icon + label (+ optional body)
// ----------------------------------------------------------------------------
function StepIcon({ status }) {
  if (status === "active") return <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-300" />;
  if (status === "error") return <AlertTriangle className="h-3.5 w-3.5 text-amber-300" />;
  if (status === "done") return <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.5} />;
  return <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />;
}

function FileStep({ step }) {
  const [open, setOpen] = useState(false);
  const preRef = useRef(null);
  const active = step.status === "active";
  const visible = active || open;

  useEffect(() => {
    if (active && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [active, step.content]);

  return (
    <div>
      <button type="button" onClick={() => !active && setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left text-[13.5px] text-neutral-300">
        <FileCode2 className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        <span className="min-w-0 truncate">{active ? "Writing" : "Created"} <code className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[12.5px] text-neutral-100">{step.path}</code></span>
        <span className="ml-auto shrink-0 text-[11px] text-neutral-600">{step.lines} lines</span>
        {!active && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-600 transition ${open ? "rotate-180" : ""}`} />}
      </button>
      {visible && (
        <pre ref={preRef} className="mt-2 max-h-56 overflow-auto rounded-xl border border-white/[0.08] bg-[#141414] p-3 font-mono text-[12px] leading-[1.55] text-neutral-300 [scrollbar-width:thin]">
          {step.content}
          {active && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-neutral-300" />}
        </pre>
      )}
    </div>
  );
}

function BuildLog({ steps }) {
  return (
    <ol className="relative space-y-3 border-l border-white/10 pl-5">
      {steps.map((s) => (
        <li key={s.id} className="relative">
          <span className="absolute -left-[27px] top-[3px] grid h-4 w-4 place-items-center rounded-full bg-[#212121]"><StepIcon status={s.status} /></span>
          {s.type === "file" ? (
            <FileStep step={s} />
          ) : (
            <div>
              <p className={`text-[13.5px] ${s.status === "pending" ? "text-neutral-600" : "text-neutral-300"}`}>{s.label}</p>
              {s.detail && <p className="mt-0.5 text-[12.5px] text-neutral-500">{s.detail}</p>}
              {s.bullets?.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {s.bullets.map((b, i) => <li key={i} className="flex gap-2 text-[13px] text-neutral-400"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-neutral-600" /><span>{b}</span></li>)}
                </ul>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

// The AI's answer is shown while it is still being written: the plan, each file and the summary are read
// out of the text as it arrives.
function AssistantTurn({ turn, onRun }) {
  const live = useMemo(() => parseLive(turn.raw), [turn.raw]);
  const streaming = turn.stage === "waiting" || turn.stage === "streaming";
  const steps = [];
  steps.push({ id: "think", type: "step", status: turn.raw ? "done" : streaming ? "active" : "error", label: turn.raw ? "Read your request" : "Reading your request" });
  const isAnswer = !!live.answer && live.files.length === 0;
  if (turn.raw && !isAnswer) {
    steps.push({ id: "plan", type: "step", status: live.planDone || !streaming ? "done" : "active", label: "Planning the build", bullets: live.plan });
    live.files.forEach((f, i) => steps.push({ id: `file-${i}`, type: "file", path: f.path, content: f.value, lines: f.value ? f.value.split("\n").length : 0, status: f.closed || !streaming ? "done" : "active" }));
  }
  steps.push(...turn.post);
  const text = turn.summary || (isAnswer ? live.answer : live.summary);

  return (
    <div className="min-w-0">
      {!(isAnswer && !streaming) && <BuildLog steps={steps} />}
      {turn.status === "error" && <p className="mt-3 flex items-start gap-2 text-[14px] text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{turn.error}</p>}
      {turn.status === "stopped" && <p className="mt-3 text-[13px] text-neutral-500">Stopped.</p>}
      {text && <div className="mt-4 text-[15px] leading-relaxed text-neutral-200"><MarkdownText text={text} /></div>}
      {turn.warn && <p className="mt-2 flex items-start gap-2 text-[13px] text-amber-200"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{turn.warn}</p>}
      {turn.deliverable && <Deliverable turn={turn} onRun={onRun} />}
      {turn.saved && <p className="mt-2 text-[11.5px] text-neutral-600">Saved to your Codex projects.</p>}
    </div>
  );
}

// ----------------------------------------------------------------------------
// The finished project: ZIP card + file list + actions
// ----------------------------------------------------------------------------
function Deliverable({ turn, onRun }) {
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { name, files, zipBytes } = turn.deliverable;

  const download = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try { saveBlob(await zipProject(name, files), `${name}.zip`); } catch (e) { setErr("Couldn't build the ZIP: " + e.message); }
    setBusy(false);
  };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1b1b1b] p-3">
        <div className="grid h-12 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-gradient-to-b from-[#2b2b2e] to-[#202022]"><FileArchive className="h-5 w-5 text-neutral-300" strokeWidth={1.6} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-white">{name}.zip</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-neutral-500">ZIP · {files.length} {files.length === 1 ? "file" : "files"}{zipBytes ? ` · ${formatSize(zipBytes)}` : ""}</div>
        </div>
        <button type="button" onClick={download} disabled={busy} aria-label={`Download ${name}.zip`} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-medium text-black transition hover:bg-neutral-200 active:scale-95 disabled:cursor-wait disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}<span>{busy ? "Building…" : "Download"}</span>
        </button>
      </div>
      {err && <p className="mt-1.5 text-xs text-amber-300">{err}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRun} className="flex items-center gap-1.5 rounded-full border border-white/15 bg-[#161616] px-3.5 py-1.5 text-[13px] text-neutral-100 transition hover:bg-[#222] active:scale-95"><Play className="h-3.5 w-3.5 text-emerald-400" /> Run in sandbox</button>
        <button type="button" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200">
          <ChevronDown className={`h-3.5 w-3.5 transition ${listOpen ? "rotate-180" : ""}`} /> {listOpen ? "Hide files" : "Show files"}
        </button>
      </div>

      {listOpen && (
        <div className="mt-2 space-y-1.5">
          {files.map((f) => (
            <div key={f.path} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#1b1b1b] px-3 py-2">
              <FileCode2 className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-200">{f.path}</span>
              <span className="shrink-0 text-[11px] text-neutral-600">{f.value.split("\n").length} lines</span>
              <button type="button" onClick={() => saveTextFile(f.path, f.value)} aria-label={`Download ${f.path}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"><Download className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main screen
// ----------------------------------------------------------------------------
export default function CodexBuilder({
  seed, initialProject, initialInput, onBack, onMenu, onOpenChat, onOpenHost,
  models = [], model, onModelChange, canUseModel, onNeedPremium, onModelMeta,
  saveProject,
}) {
  // Phones: size the screen to what is visible above the keyboard so the chat box rides on top of it.
  useKeyboardInset();
  const [turns, setTurns] = useState(() => (initialProject?.files?.length
    ? [{ id: turnSeq++, role: "assistant", kind: "note", text: `Opened **${initialProject.name}** (${initialProject.files.length} ${initialProject.files.length === 1 ? "file" : "files"}). Ask me to change it, or say "run it in the sandbox".` }]
    : []));
  const [input, setInput] = useState(initialInput || "");
  const [phase, setPhase] = useState("idle"); // idle | waiting | playing
  const [project, setProject] = useState(initialProject?.files?.length ? initialProject : null); // { name, files:[{path,value}] }
  const [sandbox, setSandbox] = useState(null); // { kind, value, entry, notes }

  const projectRef = useRef(initialProject?.files?.length ? initialProject : null);
  const historyRef = useRef([]);
  const pendingRef = useRef(null); // { request, files } when the last build stopped early; "continue" picks it up
  const recentRef = useRef([]); // paths changed by the last turn: shown first when the project is too big to send whole
  const abortRef = useRef(null);
  const skipRef = useRef(false);
  const stoppedRef = useRef(false);
  const streamDoneRef = useRef(true);
  const seededRef = useRef(null);
  const scrollRef = useRef(null);
  const boxRef = useRef(null);
  const uploadRef = useRef(null);
  const stickRef = useRef(true);

  const busy = phase !== "idle";
  const modelName = models.find((m) => m.id === model)?.name || "Model";

  const patchTurn = useCallback((id, fn) => setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t))), []);

  // Keep the thread pinned to the bottom unless the person scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [turns, sandbox]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  // ---- Run in sandbox ----------------------------------------------------------------------
  const runInSandbox = useCallback((files) => {
    const list = files || projectRef.current?.files || [];
    const prep = prepareSandbox(list);
    const id = turnSeq++;
    if (!prep.ok) {
      setTurns((prev) => [...prev, { id, role: "assistant", kind: "note", tone: "warn", text: prep.reason }]);
      return;
    }
    const noteText = `Running \`${prep.entry}\` in the sandbox. It's isolated from your account, has no network, and stops on its own after a few seconds if it loops.${prep.notes.length ? "\n\n" + prep.notes.map((n) => `- ${n}`).join("\n") : ""}`;
    setTurns((prev) => [...prev, { id, role: "assistant", kind: "note", text: noteText }]);
    setSandbox({ kind: prep.kind, value: prep.value, files: prep.files || [], entry: prep.entry, key: id });
  }, []);

  // ---- Import a real user project/file into the existing Codex workspace -------------------
  const handleProjectUpload = useCallback(async (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    if (!picked.length) return;
    try {
      const imported = await importFiles(picked);
      if (imported.fatal) {
        setTurns((prev) => [...prev, { id: turnSeq++, role: "assistant", kind: "note", tone: "warn", text: imported.fatal }]);
        return;
      }
      if (!imported.files.length) {
        setTurns((prev) => [...prev, { id: turnSeq++, role: "assistant", kind: "note", tone: "warn", text: "No supported text/code files were found in that upload." }]);
        return;
      }
      const files = imported.files.map((f) => ({ path: f.name, value: f.content }));
      const nextProject = { name: imported.projectName || "uploaded-project", files };
      projectRef.current = nextProject;
      setProject(nextProject);
      historyRef.current = []; pendingRef.current = null; recentRef.current = [];
      setSandbox(null);
      const rejectedText = imported.rejected?.length ? "\n\nSkipped files: " + imported.rejected.map((f) => `${f.name} (${f.reason})`).join(", ") : "";
      setTurns((prev) => [...prev, { id: turnSeq++, role: "assistant", kind: "note", text: `Imported **${files.length} file${files.length === 1 ? "" : "s"}** from ${picked.map((f) => f.name).join(", ")}. Choose **Run** to launch a supported browser preview, or ask Codex to modify the project.${rejectedText}` }]);
      const html = files.some((f) => /(^|\/)index\.html?$/i.test(f.path)) || files.some((f) => /\.html?$/i.test(f.path));
      const bot = files.some((f) => /telegram|telegraf|grammy|baileys|whatsapp/i.test(f.path + "\n" + f.value)) && files.some((f) => /\.(m?js|cjs|json)$/i.test(f.path));
      if (html) {
        // HTML projects can be previewed immediately in the isolated browser sandbox.
        setTimeout(() => runInSandbox(files), 0);
      } else if (bot) {
        setTurns((prev) => [...prev, { id: turnSeq++, role: "assistant", kind: "note", tone: "warn", text: "Bot project detected. This browser sandbox cannot run a persistent Node.js bot or install npm packages yet. Keep tokens out of source code; configure TELEGRAM_BOT_TOKEN or the credentials required by your bot through a secure server-side runner before starting it." }]);
      }
    } catch (error) {
      setTurns((prev) => [...prev, { id: turnSeq++, role: "assistant", kind: "note", tone: "warn", text: `Could not import project: ${error?.message || String(error)}` }]);
    }
  }, [runInSandbox]);

  // ---- Send a message --------------------------------------------------------------------------
  const send = useCallback(async (raw) => {
    const text = String(raw ?? "").trim();
    if (!text || busy) return;
    setInput("");
    stickRef.current = true;

    const userTurn = { id: turnSeq++, role: "user", text };

    // "run it in the sandbox" is a request to run, not to change code.
    if (projectRef.current && isRunIntent(text)) {
      setTurns((prev) => [...prev, userTurn]);
      runInSandbox();
      return;
    }
    if (!projectRef.current && isRunIntent(text)) {
      setTurns((prev) => [...prev, userTurn, { id: turnSeq++, role: "assistant", kind: "note", text: "There's nothing to run yet. Tell me what to build first and I'll write it, then you can run it in the sandbox." }]);
      return;
    }

    if (canUseModel && !canUseModel()) { onNeedPremium?.(); setInput(text); return; }

    // "continue" after a build that stopped early finishes the missing files instead of starting over.
    const pending = pendingRef.current;
    const ask = pending && /^(please\s+)?(continue|keep going|go on|finish( it| them)?)[.!\s]*$/i.test(text)
      ? `Finish the previous request. These files are still missing from the project: ${pending.files.join(", ")}. Write each one completely so it fits the files that already exist. The original request was: ${pending.request}`
      : text;

    const turnId = turnSeq++;
    const aiTurn = { id: turnId, role: "assistant", status: "working", stage: "waiting", raw: "", post: [], summary: "", deliverable: null, saved: false, error: "", warn: "" };
    setTurns((prev) => [...prev, userTurn, aiTurn]);
    setPhase("waiting");
    skipRef.current = false;
    stoppedRef.current = false;
    streamDoneRef.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    const addPost = (step) => patchTurn(turnId, (t) => ({ ...t, post: [...t.post, step] }));
    const patchPost = (id, patch) => patchTurn(turnId, (t) => ({ ...t, post: t.post.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
    const aborted = () => Object.assign(new Error("stopped"), { name: "AbortError" });

    try {
      // 1) Stream the answer. `received` is what has arrived; `shown` catches up to it so the text appears
      //    smoothly (it simply follows the stream when the server really streams, and animates quickly when a
      //    provider can only answer all at once).
      let received = "";
      let shown = 0;
      const payload = {
        messages: [{ role: "user", content: buildUserMessage(ask, projectRef.current, historyRef.current, { recent: recentRef.current }) }],
        persona: "professional",
        system_prompt: BUILD_SYSTEM_PROMPT,
        model,
        codex: true,
      };
      const streamP = streamChat(payload, { signal: controller.signal, onMeta: (m) => onModelMeta?.(m), onText: (t) => { received += t; } })
        .finally(() => { streamDoneRef.current = true; });
      streamP.catch(() => {});
      setPhase("playing");
      let lastShown = -1;
      while (!(streamDoneRef.current && shown >= received.length)) {
        if (skipRef.current || reducedMotion()) shown = received.length;
        else {
          const backlog = received.length - shown;
          if (backlog > 0) shown = Math.min(received.length, shown + Math.max(10, Math.ceil(backlog / 25)));
        }
        if (shown !== lastShown) {
          lastShown = shown;
          const slice = received.slice(0, shown);
          patchTurn(turnId, (t) => ({ ...t, raw: slice, stage: "streaming" }));
        }
        await sleepRaw(30);
      }
      const full = await streamP; // throws if the stream failed
      if (stoppedRef.current) throw aborted();

      const parsed = parseBuildReply(full);
      historyRef.current = [...historyRef.current, text.slice(0, 300)];

      // 2) An answer with no code change: just the answer.
      if (!parsed.files.length && !parsed.partial) {
        patchTurn(turnId, (t) => ({ ...t, status: "done", stage: "done", summary: parsed.summary || full.trim(), raw: full }));
        return;
      }

      patchTurn(turnId, (t) => ({ ...t, stage: "checking", raw: full }));
      const existingFiles = projectRef.current?.files || [];
      const existingPaths = existingFiles.map((f) => f.path);
      const projectName = projectRef.current?.name || parsed.project || slugify(text.split(/\s+/).slice(0, 4).join(" "));

      // One extra round with the AI (finishing a cut-off reply, repairing problems). It does not replace the first
      // answer; its files are merged in. Returns "" if the round failed, so the build still completes with what it has.
      const runRound = async (id, label, message) => {
        addPost({ id, type: "step", label, status: "active" });
        let got = ""; let marked = 0;
        try {
          const out = await streamChat(
            { messages: [{ role: "user", content: message }], persona: "professional", system_prompt: BUILD_SYSTEM_PROMPT, model, codex: true, codex_round: true },
            { signal: controller.signal, onMeta: (m) => onModelMeta?.(m), onText: (t) => { got += t; if (got.length - marked > 800) { marked = got.length; patchPost(id, { detail: `${got.split("\n").length} lines written` }); } } },
          );
          if (stoppedRef.current) throw aborted();
          patchPost(id, { status: "done", detail: "" });
          return out;
        } catch (e) {
          if (stoppedRef.current || e?.name === "AbortError") throw aborted();
          patchPost(id, { status: "error", label: `${label} (didn't work)`, detail: "" });
          return "";
        }
      };

      // 3a) A reply that stopped early (a file cut off mid-way, or planned files never written): ask for the rest.
      let working = parsed.files.map((f) => ({ ...f }));
      let finalSummary = parsed.summary;
      let leftover = parsed.partial;
      let gaps = replyGaps(full, parsed, existingPaths);
      for (let round = 1; gaps.incomplete && round <= 2; round += 1) {
        const ctx = { name: projectName, files: mergeFiles(existingFiles, working) };
        const todo = gaps.cutOff || gaps.missing[0];
        const reply = await runRound(`finish-${round}`, `The reply stopped early, finishing ${todo}`, buildContinueMessage(text, ctx, historyRef.current, gaps, leftover ? leftover.value.slice(-700) : ""));
        if (!reply) break;
        const next = parseBuildReply(reply);
        working = mergeFiles(working, next.files);
        if (next.summary) finalSummary = next.summary;
        leftover = next.partial;
        gaps = replyGaps(reply, { files: working, plan: parsed.plan }, existingPaths);
        if (!next.files.length && !next.partial) break; // no progress, stop asking
      }
      const unfinished = [gaps.cutOff, ...gaps.missing].filter(Boolean);
      pendingRef.current = unfinished.length ? { request: ask !== text ? pending.request : text, files: unfinished } : null;
      if (!working.length) throw new Error("The AI's reply stopped before the first file was finished. Try again, or ask for a smaller first version.");

      // 3b) Real checks (syntax of JS/JSON/CSS/Python). A broken file goes through the existing auto-fix once.
      addPost({ id: "check", type: "step", label: "Checking the code", status: "active" });
      await sleepRaw(200);
      let checked = 0;
      const problems = [];
      working.forEach((f, i) => {
        const r = checkFile(f);
        if (r.checked) checked += 1;
        if (r.error) problems.push({ i, error: r.error });
      });
      const stillBroken = [];
      for (const p of problems) {
        const f = working[p.i];
        const fixId = `fix-${p.i}`;
        addPost({ id: fixId, type: "step", label: `Found a syntax error in ${f.path}, fixing it`, detail: p.error, status: "active" });
        try {
          const lang = /\.json$/i.test(f.path) ? "json" : /\.py$/i.test(f.path) ? "python" : /\.css$/i.test(f.path) ? "css" : "javascript";
          const fixRes = await api.functions.invoke("vortyxFix", { code: f.value, language: lang, error: p.error }, { signal: controller.signal });
          const fixed = fixRes.data?.fixed_code;
          if (fixed && !checkFile({ path: f.path, value: fixed }).error) {
            working[p.i] = { path: f.path, value: fixed };
            patchPost(fixId, { status: "done", label: `Fixed the syntax error in ${f.path}` });
          } else { stillBroken.push(f.path); patchPost(fixId, { status: "error", label: `Couldn't fix ${f.path} automatically` }); }
        } catch (e) {
          if (stoppedRef.current) throw aborted();
          stillBroken.push(f.path);
          patchPost(fixId, { status: "error", label: `Couldn't fix ${f.path} automatically` });
        }
      }

      // 3c) Wiring between files: missing scripts/styles/imports, unknown element ids, package.json that doesn't match.
      // Only problems in the files this turn touched are raised (or anywhere, for a brand-new project), so an imported
      // project's older issues are not "fixed" behind the person's back.
      const changed = new Set(working.map((f) => f.path));
      const fresh = existingFiles.length === 0;
      const relevant = (list) => list.filter((p) => p.severity === "error" && (fresh || changed.has(p.path)));
      let wiring = relevant(checkProject(mergeFiles(existingFiles, working)));
      let wiringNotes = checkProject(mergeFiles(existingFiles, working)).filter((p) => p.severity === "note" && (fresh || changed.has(p.path))).length;
      if (wiring.length && !stoppedRef.current) {
        const ctx = { name: projectName, files: mergeFiles(existingFiles, working) };
        const reply = await runRound("repair", `Found ${wiring.length} ${wiring.length === 1 ? "problem" : "problems"} between files, fixing`, buildRepairMessage(text, ctx, historyRef.current, wiring));
        if (reply) {
          const repaired = parseBuildReply(reply).files.filter((f) => !checkFile(f).error);
          if (repaired.length) {
            working = mergeFiles(working, repaired);
            wiring = relevant(checkProject(mergeFiles(existingFiles, working)));
            wiringNotes = checkProject(mergeFiles(existingFiles, working)).filter((p) => p.severity === "note" && (fresh || changed.has(p.path))).length;
          }
        }
      }
      // 3d) Self-test: run it once in a hidden sandbox. If it throws, the AI reads the errors and fixes its own mistake,
      // then it is run again to confirm (2 fixes at most). Only HTML and plain JavaScript can run in a browser.
      let runtimeLeft = [];
      let selfFixed = 0;
      for (let attempt = 1; attempt <= 3 && !stoppedRef.current; attempt += 1) {
        const prep = prepareSandbox(mergeFiles(existingFiles, working));
        if (!canAutoRun(prep)) break;
        const runId = `selftest-${attempt}`;
        addPost({ id: runId, type: "step", label: attempt === 1 ? "Test-running it in a hidden sandbox" : "Running it again to confirm the fix", status: "active" });
        const run = await runHeadless(prep, { signal: controller.signal });
        if (stoppedRef.current) throw aborted();
        if (!run.errors.length) {
          patchPost(runId, { status: "done", label: selfFixed ? "It runs without errors now" : "Test run: no errors", detail: run.timedOut ? "It was still busy after 5 seconds, which can be normal for a game or animation." : "" });
          runtimeLeft = [];
          break;
        }
        runtimeLeft = run.errors;
        patchPost(runId, { status: "error", label: `Test run found ${run.errors.length === 1 ? "an error" : `${run.errors.length} errors`}`, detail: run.errors[0].slice(0, 200) });
        if (attempt === 3) break;
        const ctx = { name: projectName, files: mergeFiles(existingFiles, working) };
        const reply = await runRound(`selffix-${attempt}`, "Found a mistake while testing, correcting it", buildRuntimeFixMessage(text, ctx, historyRef.current, run.errors, attempt));
        if (!reply) break;
        const repaired = parseBuildReply(reply).files.filter((f) => !checkFile(f).error);
        if (!repaired.length) break;
        working = mergeFiles(working, repaired);
        selfFixed += 1;
      }

      const hasProblems = stillBroken.length > 0 || wiring.length > 0 || unfinished.length > 0 || runtimeLeft.length > 0;
      patchPost("check", {
        status: hasProblems ? "error" : "done",
        label: hasProblems ? "Checked the code, some problems remain" : "Checked the code",
        detail: `${checked ? `Syntax check on ${checked} ${checked === 1 ? "file" : "files"}` : "No code files to syntax-check"} and a check that the files fit together${wiringNotes ? ` (${wiringNotes} suggestion${wiringNotes === 1 ? "" : "s"})` : ""}. Nothing was run.`,
      });

      // 4) Merge into the project, package, save
      const finalFiles = mergeFiles(existingFiles, working);
      const name = projectName;
      recentRef.current = working.map((f) => f.path);
      projectRef.current = { name, files: finalFiles };
      setProject({ name, files: finalFiles });

      addPost({ id: "zip", type: "step", label: "Packaging the ZIP", status: "active" });
      let zipBytes = 0;
      try { zipBytes = (await zipProject(name, finalFiles)).size; } catch { /* the download will retry */ }
      patchPost("zip", { status: "done", label: "Packaged the ZIP" });

      let saved = false;
      try { await saveProject?.(name, finalFiles); saved = true; } catch { /* the download still works */ }

      patchTurn(turnId, (t) => ({
        ...t, status: "done", stage: "done", saved, summary: finalSummary,
        deliverable: { name, files: finalFiles, zipBytes },
        warn: [
          stillBroken.length ? `Still has syntax errors: ${stillBroken.join(", ")}. Ask me to fix it.` : "",
          unfinished.length ? `The AI never finished ${unfinished.join(", ")}, so ${unfinished.length === 1 ? "it isn't" : "they aren't"} in the project. Say "continue" and I'll write ${unfinished.length === 1 ? "it" : "them"}.` : "",
          wiring.length ? `Could still be broken: ${wiring.slice(0, 3).map((p) => p.message).join(" ")}` : "",
          runtimeLeft.length ? `The test run still shows: ${runtimeLeft[0].slice(0, 160)}. Say "fix it" and I'll try again.` : "",
        ].filter(Boolean).join(" "),
      }));
    } catch (e) {
      if (stoppedRef.current || e?.name === "AbortError") {
        patchTurn(turnId, (t) => ({ ...t, status: "stopped", stage: "done", post: t.post.map((s) => (s.status === "active" ? { ...s, status: "error", label: "Stopped" } : s)) }));
      } else {
        patchTurn(turnId, (t) => ({ ...t, status: "error", stage: "done", error: e.message || "Something went wrong.", post: t.post.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)) }));
      }
    } finally {
      abortRef.current = null;
      streamDoneRef.current = true;
      setPhase("idle");
    }
  }, [busy, model, canUseModel, onNeedPremium, patchTurn, runInSandbox, saveProject]);

  // The prompt that came from the Codex home screen starts the first build.
  useEffect(() => {
    if (seed?.prompt && seededRef.current !== seed.id) {
      seededRef.current = seed.id;
      send(seed.prompt);
    }
  }, [seed, send]);

  const stop = () => {
    // While the AI is still writing, Stop cancels the request. Once everything has arrived it just skips the animation.
    if (!streamDoneRef.current) { stoppedRef.current = true; abortRef.current?.abort(); }
    else { skipRef.current = true; }
  };

  const newBuild = () => {
    if (busy) return;
    projectRef.current = null; historyRef.current = []; pendingRef.current = null; recentRef.current = [];
    setProject(null); setTurns([]); setSandbox(null); setInput("");
    boxRef.current?.focus();
  };

  const downloadLatest = async () => {
    if (!project) return;
    saveBlob(await zipProject(project.name, project.files), `${project.name}.zip`);
  };

  const fixFromSandbox = (logs) => {
    setSandbox(null);
    send(`Running it in the sandbox showed these errors. Fix them:\n\n${logs}`);
  };

  const isEmpty = turns.length === 0;
  const chips = useMemo(() => (project && !busy ? ["Run in sandbox", "Make it look better", "Add comments and a README"] : []), [project, busy]);

  return (
    <div className="xs-keep-dark codex-viewport relative flex h-[100dvh] w-full overflow-hidden bg-[#212121] text-white">
      <CodexRail
        onMenu={onMenu}
        items={[
          { icon: Terminal, label: "New build", onClick: newBuild, active: true },
          { icon: MessageSquare, label: "Xyron Chat", onClick: onOpenChat },
          { icon: Clock, label: "Codex home", onClick: onBack },
          { icon: Rocket, label: "Host", onClick: onOpenHost },
        ]}
      />

      <main className="relative flex min-w-0 flex-1 flex-col lg:flex-none lg:w-[30%] xl:w-[29%]">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.06] px-3 pt-[env(safe-area-inset-top)] sm:px-4">
          <button type="button" onClick={onMenu} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-full text-neutral-300 hover:bg-white/5 md:hidden"><Menu className="h-5 w-5" /></button>
          <button type="button" onClick={onBack} aria-label="Back to Codex home" className="hidden h-9 w-9 place-items-center rounded-full text-neutral-400 hover:bg-white/5 hover:text-white md:grid"><ArrowLeft className="h-[18px] w-[18px]" /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{project ? project.name : "Codex"}</p>
          </div>
          <input ref={uploadRef} type="file" multiple accept=".html,.htm,.css,.js,.mjs,.cjs,.jsx,.ts,.tsx,.json,.py,.md,.txt,.yml,.yaml,.toml,.xml,.svg,.zip,.env.example, Dockerfile,Makefile,Procfile" onChange={handleProjectUpload} className="hidden" aria-label="Upload code files or ZIP project" />
          <button type="button" onClick={() => uploadRef.current?.click()} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[13px] text-neutral-200 hover:bg-white/5 disabled:opacity-40" title="Upload code files or a ZIP project"><Upload className="h-3.5 w-3.5" /> <span>Upload</span></button>
          {project && (
            <>
              <button type="button" onClick={() => runInSandbox()} disabled={busy} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-[13px] text-neutral-200 hover:bg-white/5 disabled:opacity-40"><Play className="h-3.5 w-3.5 text-emerald-400" /> <span className="hidden sm:inline">Run</span></button>
              <button type="button" onClick={downloadLatest} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-[13px] font-medium text-black hover:bg-neutral-200"><Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">ZIP</span></button>
            </>
          )}
          <button type="button" onClick={newBuild} disabled={busy} aria-label="New build" title="New build" className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 hover:bg-white/5 hover:text-white disabled:opacity-40"><SquarePen className="h-[18px] w-[18px]" /></button>
        </header>

        {/* Thread */}
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 [scrollbar-width:thin]">
          <div className="mx-auto w-full max-w-3xl space-y-7">
            {isEmpty && (
              <div className="flex flex-col items-center pt-24 text-center">
                <Sparkles className="h-7 w-7 text-neutral-500" />
                <h1 className="mt-4 text-[26px] font-medium tracking-tight">What should we build?</h1>
                <p className="mt-2 max-w-sm text-sm text-neutral-500">Describe it. I'll plan it, write every file, and hand you a ZIP. Then say "run it in the sandbox" to try it.</p>
              </div>
            )}

            {turns.map((t) => {
              if (t.role === "user") {
                return (
                  <div key={t.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-white/[0.08] px-4 py-2.5 text-[15px] leading-relaxed">{t.text}</div>
                  </div>
                );
              }
              if (t.kind === "note") {
                return (
                  <div key={t.id} className={`text-[14.5px] leading-relaxed ${t.tone === "warn" ? "text-amber-200" : "text-neutral-300"}`}>
                    <MarkdownText text={t.text} />
                  </div>
                );
              }
              return <AssistantTurn key={t.id} turn={t} onRun={() => runInSandbox(t.deliverable?.files)} />;
            })}
          </div>
        </div>

        {/* Composer */}
        <div className="codex-compose mx-auto w-full max-w-3xl shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {chips.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {chips.map((c) => (
                <button key={c} type="button" onClick={() => (c === "Run in sandbox" ? runInSandbox() : send(c))} className="shrink-0 whitespace-nowrap rounded-full border border-white/15 bg-[#161616] px-3.5 py-1.5 text-[13px] text-neutral-200 transition hover:bg-[#222] active:scale-95">{c}</button>
              ))}
            </div>
          )}
          <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#171717] shadow-2xl shadow-black/40">
            <textarea
              ref={boxRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              autoFocus={isEmpty}
              placeholder={project ? "Ask for changes, or say “run it in the sandbox”" : "Describe what to build"}
              aria-label="Message Codex"
              className="block max-h-44 min-h-[3rem] w-full resize-none bg-transparent px-5 pt-3.5 text-[16px] text-white outline-none placeholder:text-neutral-500"
            />
            <div className="flex items-center gap-1 px-3 pb-3 pt-1">
              {models.length > 0 && (
                <label className="relative flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-2 text-[14px] text-neutral-300 hover:bg-white/5">
                  <span>{modelName}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
                  <select value={model} onChange={(e) => onModelChange?.(e.target.value)} aria-label="Model" className="absolute inset-0 cursor-pointer opacity-0">
                    {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.free ? "" : " (Premium)"}</option>)}
                  </select>
                </label>
              )}
              <div className="ml-auto">
                {busy ? (
                  <button type="button" onClick={stop} aria-label="Stop" title="Stop" className="grid h-10 w-10 place-items-center rounded-full bg-white text-black hover:bg-neutral-200"><Square className="h-4 w-4 fill-current" /></button>
                ) : (
                  <button type="button" onClick={() => send(input)} disabled={!input.trim()} aria-label="Send" className="grid h-10 w-10 place-items-center rounded-full bg-white text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-neutral-500"><ArrowUp className="h-5 w-5" /></button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Desktop web workspace: keep the existing mobile experience unchanged. */}
      <section className="hidden min-w-0 flex-1 flex-col border-l border-white/[0.07] bg-[#101010] lg:flex" aria-label="Live website preview">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
          <div className="flex items-center gap-2 text-sm text-neutral-200"><Globe className="h-4 w-4 text-neutral-400" /> Preview</div>
          <span className="truncate text-xs text-neutral-500">{project?.name || "Waiting for HTML…"}</span>
        </div>
        {project?.files?.some((f) => /(^|\/)index\.html?$/i.test(f.path)) ? (
          <iframe
            key={`${project.name}-${project.files.find((f) => /(^|\/)index\.html?$/i.test(f.path))?.value || ""}`}
            title="Live HTML preview"
            sandbox="allow-scripts"
            srcDoc={buildDoc("html", project.files.find((f) => /(^|\/)index\.html?$/i.test(f.path)).value)}
            className="m-3 min-h-0 flex-1 rounded-xl border border-white/10 bg-white"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-neutral-500">
            <Globe className="h-8 w-8 opacity-50" />
            <p className="text-sm">{project ? "Create an index.html file to preview your website here." : "Your website preview will appear here after Codex creates HTML."}</p>
          </div>
        )}
      </section>

      <aside className="hidden min-w-0 flex-col border-l border-white/[0.07] bg-[#171717] lg:flex lg:w-[28%] xl:w-[29%]" aria-label="Generated source code">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 text-sm text-neutral-200"><Terminal className="h-4 w-4 text-neutral-400" /> Code</div>
        {project?.files?.length ? (
          <div className="min-h-0 flex-1 overflow-auto">
            {project.files.map((file) => (
              <details key={file.path} className="border-b border-white/[0.06]" open={/index\.html?$/i.test(file.path)}>
                <summary className="sticky top-0 cursor-pointer bg-[#1c1c1c] px-3 py-2.5 text-xs text-neutral-300 hover:bg-white/[0.05]">{file.path}</summary>
                <pre className="codex-mono overflow-x-auto whitespace-pre-wrap break-words px-3 py-3 text-[11px] leading-relaxed text-neutral-300">{file.value}</pre>
              </details>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-5 text-center text-sm text-neutral-500">Generated HTML, CSS and JavaScript files will appear here.</div>
        )}
      </aside>

      {sandbox && (
        <CodeSandbox
          key={sandbox.key}
          lang={sandbox.kind}
          value={sandbox.value}
          files={sandbox.files}
          entry={sandbox.entry}
          onClose={() => setSandbox(null)}
          onFix={fixFromSandbox}
        />
      )}
    </div>
  );
}

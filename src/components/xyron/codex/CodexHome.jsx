import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, Bot, ChevronDown, Clock, FolderClosed, Gamepad2, Globe, GraduationCap, LayoutTemplate, Menu, MessageCircle,
  MessageSquare, Mic, MonitorSmartphone, PanelLeft, Plus, Rocket, Search, Send, SquarePen, Terminal, Upload, Package, Wrench, Zap, X, Smartphone,
} from "lucide-react";
import { fileExt } from "./codexUtils";
import CodexTemplates from "./CodexTemplates";
import CodexRail from "./CodexRail";
import { useKeyboardInset } from "../../../hooks/use-keyboard-inset";

// Codex home, laid out like the Codex desktop app: an icon rail, a sidebar with New chat / Recents /
// Projects, and a centred "What should we build?" screen with a composer at the bottom.
// Every control does something real in the existing Codex workspace:
//  - "build" actions pre-fill the composer; sending runs the existing AI coding flow
//  - "fix" opens the workspace with the AI panel in Fix mode
//  - "upload" opens a file picker that imports source files / ZIP projects
//  - "recent" / the sidebar lists open your saved files
//  - "Host" opens the publish panel (Xyron link + Render)
export const STARTERS = [
  { id: "website", label: "Build a website", icon: Globe, kind: "build", fileName: "index.html", language: "html", prefix: "Build a responsive website: " },
  { id: "aiapp", label: "Create an AI app", icon: Bot, kind: "build", fileName: "index.html", language: "html", prefix: "Build a single-file AI app interface (do not put any API key in the code): " },
  { id: "mobile", label: "Build a mobile app", icon: Smartphone, kind: "build", fileName: "index.html", language: "html", prefix: "Build a mobile-first app as a responsive web app: " },
  { id: "game", label: "Create a game", icon: Gamepad2, kind: "build", fileName: "game.html", language: "html", prefix: "Create a browser game: " },
  { id: "telegram", label: "Build a Telegram bot", icon: Send, kind: "build", fileName: "bot.js", language: "javascript", prefix: "Build a Telegram bot in Node.js (read the token from an environment variable): " },
  { id: "whatsapp", label: "Build a WhatsApp bot", icon: MessageCircle, kind: "build", fileName: "bot.js", language: "javascript", prefix: "Build a WhatsApp bot in Node.js (read secrets from environment variables): " },
  { id: "automate", label: "Automate a task", icon: Zap, kind: "build", fileName: "automate.py", language: "python", prefix: "Write a Python script that automates this task: " },
  { id: "fix", label: "Fix my code", icon: Wrench, kind: "fix" },
  { id: "upload", label: "Upload a project", icon: Upload, kind: "upload", hint: "ZIP or source files" },
  { id: "school", label: "Help with my school project", icon: GraduationCap, kind: "build", fileName: "index.html", language: "html", prefix: "Help me with my school project. Build it step by step and explain each part in simple words: " },
  { id: "templates", label: "Browse templates", icon: LayoutTemplate, kind: "templates" },
  { id: "recent", label: "Open recent projects", icon: Clock, kind: "recent" },
];

// The three rows under the title, like the suggestions in the Codex app.
const SUGGESTIONS = ["website", "fix", "templates"];

const ENVIRONMENTS = [
  { id: "web", label: "Website", fileName: "index.html", language: "html" },
  { id: "node", label: "Node.js", fileName: "app.js", language: "javascript" },
  { id: "python", label: "Python", fileName: "main.py", language: "python" },
];

// The Codex mark: a soft scalloped badge with a prompt inside.
function CodexMark({ size = 64 }) {
  return (
    <div className="relative grid place-items-center text-white" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full" fill="none" stroke="currentColor" strokeWidth="3.4">
        <path d="M32.0 11.0 A9.5 9.5 0 0 1 46.8 17.2 A9.5 9.5 0 0 1 53.0 32.0 A9.5 9.5 0 0 1 46.8 46.8 A9.5 9.5 0 0 1 32.0 53.0 A9.5 9.5 0 0 1 17.2 46.8 A9.5 9.5 0 0 1 11.0 32.0 A9.5 9.5 0 0 1 17.2 17.2 A9.5 9.5 0 0 1 32.0 11.0Z" strokeLinejoin="round" />
      </svg>
      <Terminal className="relative" style={{ width: size * 0.36, height: size * 0.36 }} strokeWidth={2.6} />
    </div>
  );
}

export default function CodexHome({
  recentFiles = [], onBuild, onFix, onUpload, onOpenRecent, onUseTemplate, onOpenMenu, onOpenHost, onOpenChat,
  models = [], model, onModelChange, importing, notice,
}) {
  // Phones: size the screen to what is visible above the keyboard so the chat box rides on top of it.
  useKeyboardInset();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(null);
  const [env, setEnv] = useState("web");
  const [drag, setDrag] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const boxRef = useRef(null);
  const fileRef = useRef(null);
  const recogRef = useRef(null);

  const canSpeak = typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [text]);

  useEffect(() => () => { try { recogRef.current?.stop(); } catch { /* not running */ } }, []);

  const projects = useMemo(() => {
    const map = new Map();
    recentFiles.forEach((f) => { const p = f.project || "untitled"; if (!map.has(p)) map.set(p, f); });
    return [...map.entries()].map(([name, file]) => ({ name, file }));
  }, [recentFiles]);

  const recents = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? recentFiles.filter((f) => `${f.name} ${f.project || ""}`.toLowerCase().includes(q)) : recentFiles;
    return showMore || q ? list : list.slice(0, 8);
  }, [recentFiles, filter, showMore]);

  const choose = (s) => {
    setPlusOpen(false);
    if (s.kind === "build") {
      setPicked(s);
      setText(s.prefix);
      requestAnimationFrame(() => {
        const el = boxRef.current;
        if (el) { el.focus(); el.setSelectionRange(s.prefix.length, s.prefix.length); }
      });
    } else if (s.kind === "fix") onFix();
    else if (s.kind === "upload") fileRef.current?.click();
    else if (s.kind === "templates") setTemplatesOpen(true);
    else if (s.kind === "recent") onOpenRecent();
  };

  const newChat = () => { setPicked(null); setText(""); requestAnimationFrame(() => boxRef.current?.focus()); };

  const submit = () => {
    const prompt = text.trim();
    if (!prompt) { boxRef.current?.focus(); return; }
    if (picked && prompt === picked.prefix.trim()) { boxRef.current?.focus(); return; }
    const e = ENVIRONMENTS.find((x) => x.id === env) || ENVIRONMENTS[0];
    // A chosen starter (game.html, bot.js...) wins; otherwise use the selected environment.
    onBuild({ prompt, fileName: picked?.fileName || e.fileName, language: picked?.language || e.language });
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
  };

  const toggleMic = () => {
    if (listening) { try { recogRef.current?.stop(); } catch { /* already stopped */ } return; }
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return;
    const r = new Rec();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.onresult = (ev) => { const said = Array.from(ev.results).map((x) => x[0].transcript).join(" ").trim(); if (said) setText((t) => (t ? `${t} ${said}` : said)); };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  const modelName = models.find((m) => m.id === model)?.name || "Model";

  return (
    <div
      className="codex-home codex-viewport relative flex h-[100dvh] w-full overflow-hidden bg-[#212121] text-white"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={onDrop}
    >
      {/* Icon rail (desktop) */}
      <CodexRail
        onMenu={onOpenMenu}
        items={[
          { icon: Terminal, label: "New chat", onClick: newChat, active: true },
          { icon: MessageSquare, label: "Xyron Chat", onClick: onOpenChat },
          { icon: Clock, label: "Recent projects", onClick: () => onOpenRecent() },
          { icon: Upload, label: "Upload a project", onClick: () => fileRef.current?.click() },
          { icon: Package, label: "Templates", onClick: () => setTemplatesOpen(true) },
          { icon: Rocket, label: "Host", onClick: onOpenHost },
        ]}
      />

      {/* Sidebar (desktop) */}
      <aside className="hidden w-[300px] shrink-0 flex-col border-r border-white/[0.06] bg-[#262626] md:flex lg:w-[330px]">
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <span className="flex items-center gap-1.5 text-[17px] font-semibold">Codex <ChevronDown className="h-4 w-4 text-neutral-500" /></span>
          <div className="flex items-center gap-1 text-neutral-400">
            <button type="button" aria-label="Search recents" onClick={() => { setSearchOpen((v) => !v); setFilter(""); }} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/5 hover:text-white"><Search className="h-[18px] w-[18px]" /></button>
            <button type="button" aria-label="Open menu" onClick={onOpenMenu} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-white/5 hover:text-white"><PanelLeft className="h-[18px] w-[18px]" /></button>
          </div>
        </div>
        {searchOpen && (
          <div className="px-4 pb-2">
            <input autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search recents" aria-label="Search recents" className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-white/30" />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 [scrollbar-width:thin]">
          <button type="button" onClick={newChat} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] hover:bg-white/5">
            <SquarePen className="h-[18px] w-[18px] text-neutral-300" /> New chat
          </button>

          <p className="px-3 pb-1 pt-6 text-[13px] text-neutral-500">Recents</p>
          {recents.length === 0 && <p className="px-3 py-2 text-sm text-neutral-600">{recentFiles.length ? "Nothing matches." : "Your projects will show up here."}</p>}
          {recents.map((f) => (
            <button key={f.id} type="button" onClick={() => onOpenRecent(f)} className="flex w-full items-baseline gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-white/5">
              <span className="min-w-0 truncate text-[15px] text-neutral-100">{f.name}</span>
              <span className="min-w-0 shrink truncate text-[15px] text-neutral-500">{f.project || "untitled"}</span>
              <span className="ml-auto shrink-0 text-[10px] font-bold uppercase text-neutral-600">{fileExt(f.name) || "txt"}</span>
            </button>
          ))}
          {!filter && recentFiles.length > 8 && (
            <button type="button" onClick={() => setShowMore((v) => !v)} className="w-full rounded-xl px-3 py-2.5 text-left text-[15px] text-neutral-500 hover:bg-white/5 hover:text-neutral-300">{showMore ? "Show less" : "Show more"}</button>
          )}

          <p className="px-3 pb-1 pt-6 text-[13px] text-neutral-500">Projects</p>
          {projects.length === 0 && <p className="px-3 py-2 text-sm text-neutral-600">No projects yet.</p>}
          {projects.map((p) => (
            <button key={p.name} type="button" onClick={() => onOpenRecent(p.file)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] hover:bg-white/5">
              <FolderClosed className="h-[18px] w-[18px] shrink-0 text-neutral-400" /> <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <button type="button" onClick={onOpenMenu} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-white/5"><Menu className="h-5 w-5" /></button>
          <span className="text-[15px] font-semibold">Codex</span>
          <button type="button" onClick={onOpenHost} aria-label="Host" className="ml-auto grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-white/5"><Rocket className="h-5 w-5" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 pb-6">
          <CodexMark size={68} />
          <h1 className="mt-5 text-center text-[28px] font-medium tracking-tight sm:text-[32px]">What should we build?</h1>

          <ul className="mt-12 w-full max-w-[34rem] space-y-1">
            {SUGGESTIONS.map((id) => {
              const s = STARTERS.find((x) => x.id === id);
              const Icon = s.icon;
              return (
                <li key={id}>
                  <button type="button" onClick={() => choose(s)} className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left text-[15px] text-neutral-300 transition hover:bg-white/5 hover:text-white">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.07]"><Icon className="h-[18px] w-[18px]" /></span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Recents on phones, where the sidebar is hidden */}
          {recentFiles.length > 0 && (
            <div className="mt-8 w-full max-w-[34rem] md:hidden">
              <p className="px-3 pb-1 text-[13px] text-neutral-500">Recents</p>
              {recentFiles.slice(0, 4).map((f) => (
                <button key={f.id} type="button" onClick={() => onOpenRecent(f)} className="flex w-full items-baseline gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-white/5">
                  <span className="min-w-0 truncate text-[15px]">{f.name}</span>
                  <span className="truncate text-[15px] text-neutral-500">{f.project || "untitled"}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="codex-compose mx-auto w-full max-w-[44rem] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {importing && <p className="mb-2 text-center text-xs text-neutral-400" role="status">Importing your project…</p>}
          {notice && <p className="mb-2 text-center text-xs text-amber-300" role="alert">{notice}</p>}
          <div className="rounded-[1.75rem] border border-white/[0.07] bg-[#171717] shadow-2xl shadow-black/40">
            <div className="flex items-center gap-1 px-3 pt-2.5 text-[13px] text-neutral-400">
              <label className="relative flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 hover:bg-white/5">
                <MonitorSmartphone className="h-4 w-4" />
                <span>{ENVIRONMENTS.find((x) => x.id === env)?.label}</span>
                <ChevronDown className="h-3.5 w-3.5" />
                <select value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Environment" className="absolute inset-0 cursor-pointer opacity-0">
                  {ENVIRONMENTS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </label>
              <button type="button" onClick={onOpenHost} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 hover:bg-white/5"><Rocket className="h-4 w-4" /> Host <ChevronDown className="h-3.5 w-3.5" /></button>
              {picked && (
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs text-neutral-200">
                  <picked.icon className="h-3.5 w-3.5" /> {picked.label}
                  <button type="button" onClick={() => { setPicked(null); setText(""); }} aria-label="Clear selection" className="text-neutral-400 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                </span>
              )}
            </div>
            <textarea
              ref={boxRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder="Do anything"
              aria-label="Describe what you want to build"
              className="block max-h-44 min-h-[3rem] w-full resize-none bg-transparent px-5 py-3 text-[16px] text-white outline-none placeholder:text-neutral-500"
            />
            <div className="relative flex items-center gap-1 px-3 pb-3">
              <button type="button" onClick={() => setPlusOpen((v) => !v)} aria-label="More actions" aria-expanded={plusOpen} className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-white/5"><Plus className="h-5 w-5" /></button>
              {plusOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPlusOpen(false)} />
                  <div role="menu" className="absolute bottom-12 left-2 z-40 max-h-[50vh] w-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#262626] p-1.5 shadow-2xl shadow-black/60">
                    {STARTERS.map((s) => {
                      const Icon = s.icon;
                      const disabled = s.kind === "recent" && recentFiles.length === 0;
                      return (
                        <button key={s.id} type="button" role="menuitem" disabled={disabled} onClick={() => choose(s)} title={disabled ? "No saved projects yet" : s.hint || s.label} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-neutral-200 hover:bg-white/5 disabled:opacity-40">
                          <Icon className="h-4 w-4 text-neutral-400" /> {s.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="ml-auto flex items-center gap-1">
                {models.length > 0 && (
                  <label className="relative flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-2 text-[14px] text-neutral-300 hover:bg-white/5">
                    <span>{modelName}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
                    <select value={model} onChange={(e) => onModelChange?.(e.target.value)} aria-label="Model" className="absolute inset-0 cursor-pointer opacity-0">
                      {models.map((m) => <option key={m.id} value={m.id}>{m.name}{m.free ? "" : " (Premium)"}</option>)}
                    </select>
                  </label>
                )}
                {canSpeak && (
                  <button type="button" onClick={toggleMic} aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening} className={`grid h-10 w-10 place-items-center rounded-full hover:bg-white/5 ${listening ? "bg-white/10 text-white" : "text-neutral-400"}`}><Mic className="h-[18px] w-[18px]" /></button>
                )}
                <button type="button" onClick={submit} disabled={!text.trim()} aria-label="Send" className="grid h-10 w-10 place-items-center rounded-full bg-white text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-neutral-500"><ArrowUp className="h-5 w-5" /></button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <CodexTemplates
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        busy={importing}
        onUse={async (t) => { await onUseTemplate(t); setTemplatesOpen(false); }}
      />

      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".zip,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.html,.htm,.css,.json,.md,.txt,.sh,.yml,.yaml,.toml"
        className="hidden"
        onChange={(e) => { if (e.target.files?.length) onUpload(e.target.files); e.target.value = ""; }}
      />

      {drag && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-black/80 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-white/40 px-10 py-12 text-center">
            <Upload className="mx-auto h-8 w-8 text-white" />
            <p className="mt-3 text-sm text-white">Drop a ZIP or source files to import</p>
            <p className="mt-1 text-xs text-neutral-500">Nothing is run. Files are opened as a project.</p>
          </div>
        </div>
      )}
    </div>
  );
}

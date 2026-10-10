import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Clock, FileCode, Gamepad2, GraduationCap, Globe, LayoutTemplate, Menu, MessageCircle, Send, Smartphone, Upload, Wrench, X, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { fileExt } from "./codexUtils";
import CodexTemplates from "./CodexTemplates";

// Every action below does something real in the existing Codex workspace:
//  - "build" actions pre-fill the composer; sending runs the existing AI coding flow
//  - "fix" opens the workspace with the AI panel in Fix mode
//  - "upload" opens a file picker that imports source files / ZIP projects
//  - "recent" opens your saved files
export const STARTERS = [
  { id: "website", label: "Build a Website", icon: Globe, kind: "build", fileName: "index.html", language: "html", prefix: "Build a responsive website: " },
  { id: "aiapp", label: "Create an AI App", icon: Bot, kind: "build", fileName: "index.html", language: "html", prefix: "Build a single-file AI app interface (do not put any API key in the code): " },
  { id: "mobile", label: "Build a Mobile App", icon: Smartphone, kind: "build", fileName: "index.html", language: "html", prefix: "Build a mobile-first app as a responsive web app: " },
  { id: "game", label: "Create a Game", icon: Gamepad2, kind: "build", fileName: "game.html", language: "html", prefix: "Create a browser game: " },
  { id: "telegram", label: "Build a Telegram Bot", icon: Send, kind: "build", fileName: "bot.js", language: "javascript", prefix: "Build a Telegram bot in Node.js (read the token from an environment variable): " },
  { id: "whatsapp", label: "Build a WhatsApp Bot", icon: MessageCircle, kind: "build", fileName: "bot.js", language: "javascript", prefix: "Build a WhatsApp bot in Node.js (read secrets from environment variables): " },
  { id: "automate", label: "Automate a Task", icon: Zap, kind: "build", fileName: "automate.py", language: "python", prefix: "Write a Python script that automates this task: " },
  { id: "fix", label: "Fix My Code", icon: Wrench, kind: "fix" },
  { id: "upload", label: "Upload a Project", icon: Upload, kind: "upload", hint: "ZIP or source files" },
  { id: "school", label: "Help With My School Project", icon: GraduationCap, kind: "build", fileName: "index.html", language: "html", prefix: "Help me with my school project. Build it step by step and explain each part in simple words: " },
  { id: "templates", label: "Browse Templates", icon: LayoutTemplate, kind: "templates" },
  { id: "recent", label: "Open Recent Projects", icon: Clock, kind: "recent" },
];

const fadeUp = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

export default function CodexHome({ recentFiles = [], onBuild, onFix, onUpload, onOpenRecent, onUseTemplate, onOpenMenu, importing, notice }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState(null); // the selected build starter
  const [drag, setDrag] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const boxRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [text]);

  const choose = (s) => {
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

  const submit = () => {
    const prompt = text.trim();
    if (!prompt) { boxRef.current?.focus(); return; }
    // If the user only has the starter prefix, ask them to finish the sentence.
    if (picked && prompt === picked.prefix.trim()) { boxRef.current?.focus(); return; }
    onBuild({
      prompt,
      fileName: picked?.fileName || "index.html",
      language: picked?.language || "html",
    });
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
  };

  return (
    <div
      className="relative min-h-screen bg-black text-white md:pl-72"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={onDrop}
    >
      {/* soft red glow */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(239,68,68,0.16),transparent_70%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-16 pt-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button onClick={onOpenMenu} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-neutral-300 hover:bg-white/5 hover:text-white md:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2 text-sm font-semibold tracking-[0.18em] text-neutral-300">
            <FileCode className="h-4 w-4 text-red-500" /> XYRON CODEX
          </span>
        </div>

        <motion.div {...fadeUp} transition={{ duration: 0.45 }} className="mt-14 text-center sm:mt-20">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Your ideas. Your code. <span className="text-red-500">Your universe.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-neutral-400 sm:text-base">
            From your first website to your next AI startup, build, test, and improve it with Xyron Codex.
          </p>
        </motion.div>

        {/* Prompt composer */}
        <motion.div {...fadeUp} transition={{ duration: 0.45, delay: 0.08 }} className="mt-9">
          {picked && (
            <div className="mb-2 flex items-center gap-2 px-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-300">
                <picked.icon className="h-3.5 w-3.5" /> {picked.label}
                <button onClick={() => { setPicked(null); setText(""); }} aria-label="Clear selection" className="ml-0.5 text-red-300/70 hover:text-white"><X className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-[2rem] border border-white/10 bg-[#111] p-2 pl-5 shadow-2xl shadow-black/60 transition focus-within:border-red-500/40">
            <textarea
              ref={boxRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder="What do you want to build today?"
              aria-label="Describe what you want to build"
              className="max-h-44 min-h-[2.75rem] flex-1 resize-none bg-transparent py-3 text-[15px] text-white outline-none placeholder:text-neutral-500"
            />
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Upload a project"
              title="Upload a project (ZIP or source files)"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 text-neutral-400 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300"
            >
              <Upload className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="Build for free"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-500 text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-600"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex justify-center">
            <button
              onClick={submit}
              className="rounded-full bg-red-500 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-red-500/20 transition hover:bg-red-400 active:scale-[0.98]"
            >
              Build for Free
            </button>
          </div>
          {importing && <p className="mt-3 text-center text-xs text-neutral-400" role="status">Importing your project…</p>}
          {notice && <p className="mt-3 text-center text-xs text-amber-300" role="alert">{notice}</p>}
        </motion.div>

        {/* Starter actions */}
        <motion.div {...fadeUp} transition={{ duration: 0.45, delay: 0.16 }} className="mt-10 flex flex-wrap justify-center gap-2.5">
          {STARTERS.map((s) => {
            const Icon = s.icon;
            const disabled = s.kind === "recent" && recentFiles.length === 0;
            const active = picked?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => choose(s)}
                disabled={disabled}
                title={disabled ? "No saved projects yet" : s.hint || s.label}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? "border-red-500/50 bg-red-500/10 text-white" : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-red-400/30 hover:bg-red-500/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 text-red-400" /> {s.label}
              </button>
            );
          })}
        </motion.div>

        {/* Recent files */}
        {recentFiles.length > 0 && (
          <motion.section {...fadeUp} transition={{ duration: 0.45, delay: 0.24 }} className="mt-14" aria-label="Continue building">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Continue building</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recentFiles.slice(0, 6).map((f) => (
                <button
                  key={f.id}
                  onClick={() => onOpenRecent(f)}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-red-400/30 hover:bg-red-500/5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/5 text-[10px] font-bold uppercase text-red-300">{fileExt(f.name) || "txt"}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">{f.name}</span>
                    <span className="block truncate text-xs text-neutral-500">{f.project || "untitled"}</span>
                  </span>
                </button>
              ))}
            </div>
          </motion.section>
        )}
      </div>

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
          <div className="rounded-3xl border-2 border-dashed border-red-500/60 px-10 py-12 text-center">
            <Upload className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-3 text-sm text-white">Drop a ZIP or source files to import</p>
            <p className="mt-1 text-xs text-neutral-500">Nothing is run. Files are only opened in the editor.</p>
          </div>
        </div>
      )}
    </div>
  );
}

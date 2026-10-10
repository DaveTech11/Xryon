import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown, Plus, Camera, Send, X, MessageSquare, Search, Code2, Image as ImageIcon,
  ScanSearch, PenLine, Zap, Languages, Settings2, Palette, Hammer, Brain, FolderOpen, ListChecks, Sparkles, Mic,
} from "lucide-react";
import { COMMANDS, parseCommand } from "../../lib/commands";
import CommandPalette from "./CommandPalette";
import ImageShortcuts, { IMAGE_SHORTCUTS } from "./ImageShortcuts";
import GptLimitModal from "./GptLimitModal";
import { getSetting, setSetting, checkPremium } from "../../lib/settings";

const MODELS = ["Vortex", "Xyron 4.1", "Xyron Plus"];
// Premium-only models — selecting one without an active Premium/Premium+
// (or admin) plan opens the upgrade prompt instead of switching models.
const PREMIUM_MODELS = ["Vortex", "Xyron 4.1"];
const DEFAULT_FREE_MODEL = "Xyron Plus";

const GROUP_ICONS = {
  Magic: Sparkles, Chat: MessageSquare, Code: Code2, Write: PenLine, Analyze: ScanSearch, Image: ImageIcon,
  Design: Palette, Build: Hammer, Think: Brain, Project: FolderOpen, Tasks: ListChecks, "Xyron modes": Zap, Language: Languages, Research: Search, Controls: Settings2,
};

export default function Composer({ onSend, disabled, onClearChat, onRegenerate, onExport, onShare, onOpenHistory, onAction, onVoiceChat }) {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [xmode, setXmode] = useState(getSetting("xyronMode", "auto"));
  const [v, setV] = useState("");
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]); // object URLs for image files in `files`, same index
  const [model, setModel] = useState(getSetting("selectedModel", DEFAULT_FREE_MODEL));
  const [modelOpen, setModelOpen] = useState(false);
  const [isPremium, setIsPremium] = useState(null); // null = still checking; treated as locked until resolved
  const [lockedModelPrompt, setLockedModelPrompt] = useState(null);
  const [cmdActiveIndex, setCmdActiveIndex] = useState(0);
  const [imageGalleryTrigger, setImageGalleryTrigger] = useState(0);
  const inputRef = useRef(null);
  const plusRef = useRef(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const canCapture = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  useEffect(() => {
    if (!plusOpen) return;
    const away = (e) => { if (plusRef.current && !plusRef.current.contains(e.target)) setPlusOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setPlusOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); window.removeEventListener("keydown", esc); };
  }, [plusOpen]);
  // kind: "photos" | "camera" | "files" - same hidden input, different picker settings
  const pickFiles = (kind) => {
    const el = inputRef.current;
    if (!el) return;
    el.accept = kind === "files" ? "" : "image/*";
    if (kind === "camera") el.setAttribute("capture", "environment"); else el.removeAttribute("capture");
    setPlusOpen(false);
    el.click();
  };
  const textareaRef = useRef(null);
  const modelMenuRef = useRef(null);
  const cmdMenuRef = useRef(null);
  const composerBoxRef = useRef(null);

  useEffect(() => {
    if (!modelOpen) return;
    const close = (e) => { if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) setModelOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [modelOpen]);

  useEffect(() => {
    let cancelled = false;
    checkPremium().then((v) => { if (!cancelled) setIsPremium(v); }).catch(() => { if (!cancelled) setIsPremium(false); });
    return () => { cancelled = true; };
  }, []);

  // If a previously-saved selection is now a premium-only model and the
  // account isn't premium, quietly fall back to the free model rather than
  // silently sending premium-model requests the account can't use.
  useEffect(() => {
    if (isPremium === null || isPremium) return;
    if (PREMIUM_MODELS.includes(model)) {
      setModel(DEFAULT_FREE_MODEL);
      setSetting("selectedModel", DEFAULT_FREE_MODEL);
    }
  }, [isPremium, model]);

  const MAX_TEXTAREA_HEIGHT = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches ? 120 : 200; // keep the composer compact on phones
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [v]);

  // Build (and clean up) thumbnail object URLs whenever the attached files change,
  // rather than creating a new blob URL on every keystroke re-render.
  useEffect(() => {
    const urls = files.map((file) => (file.type?.startsWith("image/") ? URL.createObjectURL(file) : null));
    setPreviews(urls);
    return () => { urls.forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [files]);

  const chooseModel = (name) => {
    if (PREMIUM_MODELS.includes(name) && !isPremium) {
      setModelOpen(false);
      setLockedModelPrompt(name);
      return;
    }
    setModel(name);
    setSetting("selectedModel", name);
    setModelOpen(false);
  };
  const slashQuery = v.trimStart().match(/^(\/[^\s]*)$/)?.[1]?.toLowerCase() || "";
  const cmdMatches = slashQuery
    ? COMMANDS.filter((c) => c.command.startsWith(slashQuery) || c.label.toLowerCase().includes(slashQuery.slice(1)) || c.desc.toLowerCase().includes(slashQuery.slice(1)))
    : [];
  // The general command menu takes priority over the style-specific image
  // shortcuts when it has matches (e.g. "/co" → /code); otherwise the
  // existing image-shortcut suggestions still work exactly as before.
  const slashMatches = !cmdMatches.length && slashQuery ? IMAGE_SHORTCUTS.filter(([command, label]) => `${command} ${label}`.toLowerCase().includes(slashQuery)).slice(0, 6) : [];

  useEffect(() => { setCmdActiveIndex(0); }, [slashQuery]);
  useEffect(() => {
    cmdMenuRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cmdActiveIndex, cmdMatches.length]);

  useEffect(() => {
    if (!cmdMatches.length) return;
    // Only dismiss when clicking fully outside the composer (menu + input) —
    // clicking back into the textarea should keep editing, not clear it.
    const close = (e) => { if (composerBoxRef.current && !composerBoxRef.current.contains(e.target)) setV(""); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [cmdMatches.length]);

  const runCommand = (cmd) => {
    if (cmd.kind === "action") {
      const name = cmd.command;
      if (name === "/mode" || name === "/xyron") { setV("/"); textareaRef.current?.focus(); return; }
      setV("");
      if (name === "/x") setPaletteOpen(true);
      else if (name === "/help") onAction?.(name);
      else if (["/bookmark", "/snapshot", "/context", "/status"].includes(name)) onAction?.(name);
      else if (name === "/clear" || name === "/new") onClearChat?.();
      else if (name === "/model" || name === "/models") setModelOpen(true);
      else if (name === "/settings" || name === "/memory") navigate("/settings");
      else if (name === "/history") onOpenHistory?.();
      else if (name === "/regenerate") onRegenerate?.();
      else if (name === "/export") onExport?.();
      else if (name === "/share") onShare?.();
      return;
    }
    if (cmd.kind === "xmode") {
      const id = cmd.command.slice(1);
      setSetting("xyronMode", id);
      setXmode(id);
      setV("");
      return;
    }
    if (cmd.kind === "mode" && cmd.defaultInput) {
      setV("");
      onSend(cmd.command, []);
      return;
    }
    if (cmd.command === "/image") {
      setV(`${cmd.command} `);
      setImageGalleryTrigger((n) => n + 1);
      textareaRef.current?.focus();
      return;
    }
    setV(`${cmd.command} `);
    textareaRef.current?.focus();
  };

  const submit = () => {
    if ((!v.trim() && files.length === 0) || disabled) return;
    // A text command with nothing after it (and no file) has nothing to act on yet.
    const parsed = parseCommand(v, files);
    if (parsed && parsed.cmd.kind === "xmode" && !parsed.arg && files.length === 0) { runCommand(parsed.cmd); return; }
    if (parsed && (parsed.cmd.kind === "mode" || parsed.cmd.kind === "magic") && !parsed.arg && !parsed.cmd.defaultInput && files.length === 0) return;
    if (parsed && parsed.cmd.kind === "action") { runCommand(parsed.cmd); return; }
    onSend(v.trim(), files);
    setV("");
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleComposerKeyDown = (e) => {
    if (cmdMatches.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCmdActiveIndex((i) => (i + 1) % cmdMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setCmdActiveIndex((i) => (i - 1 + cmdMatches.length) % cmdMatches.length); return; }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runCommand(cmdMatches[cmdActiveIndex]); return; }
      if (e.key === "Escape") { e.preventDefault(); setV(""); return; }
      if (e.key === "Tab") { e.preventDefault(); runCommand(cmdMatches[cmdActiveIndex]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const addFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length) setFiles((current) => [...current, ...selected]);
    event.target.value = ""; // lets the same file be picked again later
  };

  return (
    <>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onPick={(c) => { setPaletteOpen(false); runCommand(c); }} />
    <ImageShortcuts disabled={disabled} openSignal={imageGalleryTrigger} onPick={(prompt) => { setV((current) => current ? `${current} ${prompt}` : prompt); textareaRef.current?.focus(); }} />
    <GptLimitModal open={!!lockedModelPrompt} onClose={() => setLockedModelPrompt(null)} lockedModel={lockedModelPrompt} />
    <div ref={composerBoxRef} className="xyron-composer relative rounded-[1.5rem] border border-white/10 bg-[#2f2f2f] p-2 shadow-2xl shadow-black/40">
      {xmode !== "auto" && (
        <div className="mb-2 flex px-1">
          <button type="button" onClick={() => { setSetting("xyronMode", "auto"); setXmode("auto"); }} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300 hover:text-white" title="Back to /auto">
            <Zap className="h-3 w-3" /> {xmode} mode <X className="h-3 w-3 text-neutral-500" />
          </button>
        </div>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {files.map((file, index) => {
            const previewUrl = previews[index];
            return previewUrl ? (
              <div key={`${file.name}-${index}`} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
                <button
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div key={`${file.name}-${index}`} className="flex max-w-[220px] items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-neutral-300">
                <span className="truncate">{file.name}</span>
                <button onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} className="text-neutral-500 hover:text-white" aria-label={`Remove ${file.name}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {cmdMatches.length > 0 && (
        <div
          ref={cmdMenuRef}
          className="xcode-scroll absolute bottom-full left-0 right-0 z-30 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0b] p-1.5 shadow-2xl shadow-black/50 sm:left-2 sm:right-auto sm:w-80"
        >
          <p className="px-2.5 pb-1 pt-1 text-[9px] uppercase tracking-[0.18em] text-neutral-600">{cmdMatches[0].group}</p>
          {cmdMatches.map((cmd, i) => {
            const Icon = GROUP_ICONS[cmd.group] || MessageSquare;
            const active = i === cmdActiveIndex;
            const showHeader = i === 0 || cmdMatches[i - 1].group !== cmd.group;
            return (
              <React.Fragment key={cmd.command}>
                {showHeader && i > 0 && <p className="px-2.5 pb-1 pt-2 text-[9px] uppercase tracking-[0.18em] text-neutral-600">{cmd.group}</p>}
                <button
                  type="button"
                  data-active={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setCmdActiveIndex(i)}
                  onClick={() => runCommand(cmd)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${active ? "bg-white/10" : "hover:bg-white/5"}`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${active ? "border-white/20 bg-white/10 text-white" : "border-white/10 text-neutral-400"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{cmd.command}</span>
                      {cmd.kind === "xmode" && xmode === cmd.command.slice(1) && <span className="text-[10px] text-emerald-400">active</span>}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">{cmd.desc}</span>
                  </span>
                </button>
              </React.Fragment>
            );
          })}
          <div className="mt-1 flex items-center gap-1.5 border-t border-white/10 px-2.5 pt-2 text-[10px] text-neutral-600">
            <span className="rounded bg-white/5 px-1.5 py-0.5">↑↓</span> navigate <span className="rounded bg-white/5 px-1.5 py-0.5">↵</span> select <span className="rounded bg-white/5 px-1.5 py-0.5">esc</span> dismiss
          </div>
        </div>
      )}
      {slashMatches.length > 0 && (
        <div className="mb-2 rounded-xl border border-white/10 bg-black p-2 shadow-xl">
          <p className="px-2 pb-1 text-[9px] uppercase tracking-[0.18em] text-neutral-600">Image shortcuts</p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {slashMatches.map(([command, label]) => <button key={command} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setV(`${command} `); textareaRef.current?.focus(); }} className="rounded-lg px-2.5 py-2 text-left text-[11px] text-neutral-400 hover:bg-white/10 hover:text-white"><span className="font-medium text-white">{command}</span><span className="ml-2 text-neutral-600">{label}</span></button>)}
          </div>
        </div>
      )}
      <div className="xyron-composer-row flex items-end gap-2">
        <input ref={inputRef} type="file" multiple className="hidden" onChange={addFiles} />
        <div ref={plusRef} className="relative shrink-0">
          <button type="button" disabled={disabled} onClick={() => setPlusOpen((o) => !o)} aria-haspopup="menu" aria-expanded={plusOpen} className={`xyron-composer-icon grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-neutral-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30 ${plusOpen ? "bg-white/10 text-white" : ""}`} title="Add images or files" aria-label="Add images or files">
            <Plus className={`h-5 w-5 transition-transform ${plusOpen ? "rotate-45" : ""}`} strokeWidth={2.25} />
          </button>
          {plusOpen && (
            <div role="menu" className="absolute bottom-full left-0 z-40 mb-2 w-48 rounded-2xl border border-white/10 bg-black p-1.5 shadow-2xl shadow-black/60">
              <button type="button" role="menuitem" onClick={() => pickFiles("photos")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 hover:bg-white/10">
                <ImageIcon className="h-4 w-4 text-neutral-400" /> Photos
              </button>
              {canCapture && (
                <button type="button" role="menuitem" onClick={() => pickFiles("camera")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 hover:bg-white/10">
                  <Camera className="h-4 w-4 text-neutral-400" /> Camera
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => pickFiles("files")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 hover:bg-white/10">
                <FolderOpen className="h-4 w-4 text-neutral-400" /> Files
              </button>
            </div>
          )}
        </div>
        <textarea ref={textareaRef} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={handleComposerKeyDown} disabled={disabled} rows={1} placeholder="Message Xyron" className="xyron-composer-textarea max-h-[120px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-neutral-600 sm:text-sm" />

        <div ref={modelMenuRef} className="relative ml-1 mr-2 shrink-0">
          {modelOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-36 rounded-xl border border-white/10 bg-black p-1 shadow-xl">
              {MODELS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => chooseModel(name)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${name === model ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}
                >
                  <span className="truncate">{name}</span>
                  {PREMIUM_MODELS.includes(name) && !isPremium && (
                    <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-300">PRO</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setModelOpen((o) => !o)}
            className="xyron-model-button flex h-10 shrink-0 items-center gap-1 rounded-xl border border-white/10 px-2 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white disabled:opacity-30 sm:gap-1.5 sm:px-3"
            title="Choose model"
          >
            <span className="max-w-[64px] truncate sm:max-w-[120px]">{model}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        <button type="button" onClick={onVoiceChat} disabled={disabled} className="xyron-composer-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-neutral-400 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30" title="Voice chat" aria-label="Open voice chat">
          <Mic className="h-4 w-4" />
        </button>
        <button onClick={submit} disabled={disabled || (!v.trim() && files.length === 0)} className="xyron-composer-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-black transition hover:bg-neutral-200 disabled:opacity-30">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
    </>
  );
}



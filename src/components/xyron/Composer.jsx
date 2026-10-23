import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Camera, ArrowUp, X, MessageSquare, Search, Code2, Image as ImageIcon, Square,
  ScanSearch, PenLine, Zap, Languages, Settings2, Palette, Hammer, Brain, FolderOpen, ListChecks, Sparkles,
  Globe, Check, LayoutList, Loader2,
  AudioLines,
} from "lucide-react";
import { COMMANDS, parseCommand } from "../../lib/commands";
import CommandPalette from "./CommandPalette";
import ImageShortcuts, { IMAGE_SHORTCUTS } from "./ImageShortcuts";
import { getSetting, setSetting, isWebSearchOn, isRichCardsOn, onSettingChange } from "../../lib/settings";

// The model switch no longer lives in the chat box: it is in Settings -> Model (see lib/models.js).

const GROUP_ICONS = {
  Magic: Sparkles, Chat: MessageSquare, Code: Code2, Write: PenLine, Analyze: ScanSearch, Image: ImageIcon,
  Design: Palette, Build: Hammer, Think: Brain, Project: FolderOpen, Tasks: ListChecks, "Xyron modes": Zap, Language: Languages, Research: Search, Controls: Settings2,
};

export default function Composer({ onSend, disabled, onStop, onClearChat, onRegenerate, onExport, onShare, onOpenHistory, onAction, onVoiceChat, uploadStatus = null }) {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [xmode, setXmode] = useState(getSetting("xyronMode", "auto"));
  // The two switches in the "+" menu (also in Settings): live web search, and rich text cards.
  const [webOn, setWebOn] = useState(isWebSearchOn);
  const [cardsOn, setCardsOn] = useState(isRichCardsOn);
  const [imageModel, setImageModel] = useState(() => getSetting("imageModel", "Xryon Ximage"));
  useEffect(() => onSettingChange(() => { setWebOn(isWebSearchOn()); setCardsOn(isRichCardsOn()); }), []);
  const [v, setV] = useState("");
  // Prompts sent from Xyron Brain (Prompt Library / Compare AI output) land here once.
  useEffect(() => { try { const p = localStorage.getItem("xb_prompt"); if (p) { localStorage.removeItem("xb_prompt"); const t = JSON.parse(p); if (typeof t === "string" && t) setV(t); } } catch { /* ignore */ } }, []);
  const [files, setFiles] = useState([]);
  // Files that were just sent stay visible inside the box while they upload (like Claude), then disappear.
  const [sending, setSending] = useState([]);
  const sawUploading = useRef(false);
  const [previews, setPreviews] = useState([]); // object URLs for image files in `files`, same index
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
  const cmdMenuRef = useRef(null);
  const composerBoxRef = useRef(null);

  // Phones: one slim pill while the message fits on a line; once it wraps (or has a new line) the box
  // opens up - text on top, buttons underneath - like ChatGPT. It goes back to the pill when it is empty.
  const [expanded, setExpanded] = useState(false);
  const MAX_TEXTAREA_HEIGHT = expanded ? 200 : typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches ? 120 : 200;
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
    if (!v) { if (expanded) setExpanded(false); }
    else if (!expanded && window.matchMedia?.("(max-width: 767px)").matches && (el.scrollHeight > 48 || v.includes("\n"))) setExpanded(true);
  }, [v, expanded]);

  // Build (and clean up) thumbnail object URLs whenever the attached files change,
  // rather than creating a new blob URL on every keystroke re-render.
  useEffect(() => {
    const urls = files.map((file) => (file.type?.startsWith("image/") ? URL.createObjectURL(file) : null));
    setPreviews(urls);
    return () => { urls.forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [files]);

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
      else if (name === "/model" || name === "/models") navigate("/settings?tab=model");
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

  useEffect(() => {
    if (!sending.length) return undefined;
    if (uploadStatus?.phase === "uploading") { sawUploading.current = true; return undefined; }
    const clear = () => { sending.forEach((f) => f.url && URL.revokeObjectURL(f.url)); setSending([]); };
    // Upload finished (or never started): drop the chips shortly after.
    const t = setTimeout(clear, sawUploading.current ? 400 : 8000);
    return () => clearTimeout(t);
  }, [sending, uploadStatus]);

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
    <div ref={composerBoxRef} className={`xyron-composer ${expanded ? "xyron-expanded" : ""} relative rounded-[1.75rem] border border-white/10 bg-[#2f2f2f] px-3 pb-2.5 pt-3 shadow-2xl shadow-black/40`}>
      {xmode !== "auto" && (
        <div className="mb-2 flex px-1">
          <button type="button" onClick={() => { setSetting("xyronMode", "auto"); setXmode("auto"); }} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300 hover:text-white" title="Back to /auto">
            <Zap className="h-3 w-3" /> {xmode} mode <X className="h-3 w-3 text-neutral-500" />
          </button>
        </div>
      )}
      {sending.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1" aria-live="polite">
          {sending.map((file, index) => {
            const done = uploadStatus?.phase === "uploading" ? index < uploadStatus.done : sawUploading.current;
            const state = done ? <Check className="h-4 w-4 text-emerald-300" /> : <Loader2 className="h-4 w-4 animate-spin text-white" />;
            return file.url ? (
              <div key={`s-${file.name}-${index}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <img src={file.url} alt={file.name} className={`h-full w-full object-cover transition ${done ? "" : "opacity-60"}`} />
                <div className="absolute inset-0 grid place-items-center bg-black/30">{state}</div>
              </div>
            ) : (
              <div key={`s-${file.name}-${index}`} className="flex max-w-[220px] items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-neutral-300">
                {state}
                <span className="truncate">{file.name}</span>
              </div>
            );
          })}
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
      {/* Image generation provider is independent from the chat model. */}
      <div className="xyron-image-model-row mb-1 flex items-center gap-2 px-2">
        <ImageIcon className="h-3.5 w-3.5 text-neutral-500" />
        <label htmlFor="xyron-image-model" className="text-[11px] text-neutral-500">Image model</label>
        <select id="xyron-image-model" value={imageModel} onChange={(e) => { setImageModel(e.target.value); setSetting("imageModel", e.target.value); }} className="max-w-[10rem] rounded-lg border border-white/10 bg-[#252528] px-2 py-1 text-[11px] text-neutral-300 outline-none focus:border-white/25">
          <option value="Xryon Ximage">Xryon Ximage</option>
          <option value="Xryon Studio">Xryon Studio</option>
        </select>
      </div>
      {/* Text on top; "+" bottom-left; mic and the round send/stop button bottom-right. */}
      <input ref={inputRef} type="file" multiple className="hidden" onChange={addFiles} />
      <div className="xyron-composer-row flex items-center justify-between gap-2">
        <div ref={plusRef} className="relative shrink-0">
          <button type="button" disabled={disabled} onClick={() => setPlusOpen((o) => !o)} aria-haspopup="menu" aria-expanded={plusOpen} className={`xyron-composer-btn text-neutral-300 transition hover:bg-white/10 hover:text-white disabled:opacity-30 ${plusOpen ? "bg-white/10 text-white" : ""}`} title="Add images or files" aria-label="Add images or files">
            <Plus className={`h-[22px] w-[22px] transition-transform ${plusOpen ? "rotate-45" : ""}`} strokeWidth={1.75} />
          </button>
          {plusOpen && (
            <div role="menu" className="absolute bottom-full left-0 z-40 mb-2 w-56 rounded-2xl border border-white/10 bg-black p-1.5 shadow-2xl shadow-black/60">
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
              <div className="mx-2 my-1 border-t border-white/10" />
              <button type="button" role="menuitemcheckbox" aria-checked={webOn} onClick={() => setSetting("webSearch", webOn ? "off" : "on")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 hover:bg-white/10">
                <Globe className="h-4 w-4 text-neutral-400" /> <span className="flex-1">Web search</span>
                {webOn && <Check className="h-4 w-4 text-[#3b6cf6]" strokeWidth={2.5} />}
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={cardsOn} onClick={() => setSetting("richCards", cardsOn ? "off" : "on")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 hover:bg-white/10">
                <LayoutList className="h-4 w-4 text-neutral-400" /> <span className="flex-1">Rich text cards</span>
                {cardsOn && <Check className="h-4 w-4 text-[#3b6cf6]" strokeWidth={2.5} />}
              </button>
            </div>
          )}
        </div>

        {webOn && (
          <button type="button" onClick={() => setSetting("webSearch", "off")} className="mr-auto flex items-center gap-1.5 rounded-full bg-[#3b6cf6]/15 px-3 py-1.5 text-xs font-medium text-[#8fb0ff] transition hover:bg-[#3b6cf6]/25" title="Web search is on - tap to turn off" aria-label="Turn off web search">
            <Globe className="h-3.5 w-3.5" /> <span className="xyron-chip-label">Search</span> <X className="h-3 w-3" />
          </button>
        )}
        <textarea ref={textareaRef} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={handleComposerKeyDown} disabled={disabled} rows={1} placeholder="Message Xyron" aria-label="Message Xyron" className="xyron-composer-textarea block max-h-[200px] min-h-[46px] w-full resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-neutral-500 sm:text-[15px]" />
        <div className="flex shrink-0 items-center gap-1.5">
          {disabled && onStop ? (
            <button type="button" onClick={onStop} className="xyron-composer-btn bg-white text-black transition hover:bg-neutral-200 active:scale-95" title="Stop generating" aria-label="Stop AI response">
              <Square className="h-3.5 w-3.5" fill="currentColor" strokeWidth={2} />
            </button>
          ) : (!v.trim() && files.length === 0) ? (
            <button type="button" onClick={onVoiceChat} disabled={disabled} className="xyron-composer-btn xyron-voice-btn transition active:scale-95 disabled:opacity-30" title="Voice chat" aria-label="Open voice chat">
              <AudioLines className="h-[19px] w-[19px]" strokeWidth={2} />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!v.trim() && files.length === 0} className="xyron-composer-btn bg-white text-black transition hover:bg-neutral-200 active:scale-95 disabled:bg-white/10 disabled:text-neutral-500" title="Send" aria-label="Send message">
              <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
}



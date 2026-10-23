import React, { useEffect, useRef, useState } from "react";
import { X, Copy, Check, Download, Pencil, Save, RotateCcw } from "lucide-react";
import { copyToClipboard } from "../../lib/clipboard";
import { codeFileName, downloadTextFile } from "../../lib/downloadFile";

const LANG_LABELS = {
  js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", py: "Python",
  html: "HTML", css: "CSS", json: "JSON", bash: "Shell", sh: "Shell",
  shell: "Shell", sql: "SQL", md: "Markdown", text: "Text", yaml: "YAML",
  yml: "YAML", txt: "Text",
};

// Works on phones and laptops: full screen on a phone, a centred window on a laptop.
// "Edit" turns the code into an editable box (Tab key works on a keyboard). "Save" keeps the edit for the
// download / ZIP cards of that message; "Reset" goes back to what Xyron wrote.
export default function CodeBlockModal({ lang = "", path = "", value = "", original = null, onSave = null, onClose }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const areaRef = useRef(null);
  const label = path || LANG_LABELS[lang.toLowerCase()] || (lang ? lang.toUpperCase() : "Copyable text");
  const canEdit = typeof onSave === "function";
  const current = editing ? draft : value;
  const changed = canEdit && original != null && value !== original;
  const dirty = editing && draft !== value;

  // Lock the page behind the modal so a phone scrolls the code, not the chat underneath.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !editing) onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  const handleCopy = async () => {
    try { await copyToClipboard(current); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => areaRef.current?.focus(), 30);
  };

  const save = () => {
    onSave?.(draft);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const cancel = () => { setDraft(value); setEditing(false); };

  const reset = () => {
    if (original == null) return;
    onSave?.(original);
    setDraft(original);
    setEditing(false);
  };

  const close = () => {
    if (dirty && !window.confirm("You have unsaved edits. Close without saving?")) return;
    onClose?.();
  };

  const onKeyDown = (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.target;
      const { selectionStart: a, selectionEnd: b } = el;
      const next = `${draft.slice(0, a)}  ${draft.slice(b)}`;
      setDraft(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 2; });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
    }
  };

  const btn = "flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white active:scale-95";
  const lines = current ? current.split("\n").length : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={close}>
      <div
        className="xs-keep-dark flex h-full w-full flex-col overflow-hidden bg-[#111113] shadow-2xl sm:h-auto sm:max-h-[88vh] sm:max-w-3xl sm:rounded-2xl sm:border sm:border-white/10"
        style={{ minHeight: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-neutral-200">{label}</div>
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              {lines} lines{changed ? " · edited" : ""}{editing ? " · editing" : ""}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {canEdit && !editing && (
              <button type="button" onClick={startEdit} className={`${btn} border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20`}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {editing && (
              <>
                <button type="button" onClick={save} disabled={!dirty} className={`${btn} border-emerald-500/30 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40`}>
                  <Save className="h-3.5 w-3.5" /> Save
                </button>
                <button type="button" onClick={cancel} className={btn}>Cancel</button>
              </>
            )}
            {saved && <span className="text-[11px] text-emerald-400">Saved ✓</span>}
            {changed && !editing && (
              <button type="button" onClick={reset} className={btn} title="Go back to what Xyron wrote">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            )}
            <button type="button" onClick={handleCopy} className={btn}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>
            <button type="button" onClick={() => downloadTextFile(codeFileName(lang, path), current)} className={btn}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {editing ? (
          <textarea
            ref={areaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            wrap="off"
            className="min-h-0 w-full flex-1 resize-none overflow-auto bg-[#0b0b0c] px-3 py-3 font-mono text-[16px] leading-relaxed text-neutral-100 outline-none sm:px-4 sm:text-[13px]"
            style={{ minHeight: "50vh", tabSize: 2, WebkitOverflowScrolling: "touch" }}
          />
        ) : (
          <pre
            className="min-h-0 flex-1 overflow-auto px-3 py-3 text-[13px] leading-relaxed text-neutral-200 sm:px-4 sm:py-4"
            style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
          >
            <code>{value}</code>
          </pre>
        )}
      </div>
    </div>
  );
}

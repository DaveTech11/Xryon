import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, AlertTriangle } from "lucide-react";
import { fileIconColor } from "./codexUtils";

function Overlay({ onClose, children, align = "top" }) {
  return (
    <div
      className={`fixed inset-0 z-[60] flex justify-center bg-black/60 px-4 backdrop-blur-sm ${align === "top" ? "items-start pt-[12vh]" : "items-center"}`}
      onMouseDown={onClose}
    >
      <div onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-xl">
        {children}
      </div>
    </div>
  );
}

export function CodexCommandPalette({ open, onClose, commands }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(t) || c.group.toLowerCase().includes(t));
  }, [q, commands]);

  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div className="codex-panel overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--codex-border)" }}>
          <Search className="h-4 w-4 text-[color:var(--codex-text-faint)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && filtered[0]) { filtered[0].run(); onClose(); } }}
            placeholder="Type a command…"
            className="codex-mono flex-1 bg-transparent text-sm text-[color:var(--codex-text)] outline-none placeholder:text-[color:var(--codex-text-faint)]"
          />
          <button onClick={onClose} aria-label="Close" className="text-[color:var(--codex-text-faint)] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="codex-scroll max-h-[50vh] overflow-auto p-1.5">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => { c.run(); onClose(); }}
              className="flex w-full items-center justify-between px-2.5 py-2 text-left text-sm text-[color:var(--codex-text)] hover:bg-white/5"
            >
              <span>{c.label}</span>
              <span className="text-[10px] uppercase tracking-widest text-[color:var(--codex-text-faint)]">{c.group}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-xs text-[color:var(--codex-text-faint)]">No matching commands.</p>}
        </div>
        <p className="px-3 py-2 text-[10px] text-[color:var(--codex-text-faint)]" style={{ borderTop: "1px solid var(--codex-border)" }}>
          <span className="text-[color:var(--codex-text-dim)]">Ctrl/⌘+Shift+P</span> commands · <span className="text-[color:var(--codex-text-dim)]">Ctrl/⌘+P</span> quick open
        </p>
      </div>
    </Overlay>
  );
}

export function CodexQuickOpen({ open, onClose, files, onPick }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const sorted = [...files];
    if (!t) return sorted.slice(0, 20);
    return sorted.filter((f) => f.name.toLowerCase().includes(t)).slice(0, 30);
  }, [q, files]);

  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div className="codex-panel overflow-hidden shadow-2xl">
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--codex-border)" }}>
          <Search className="h-4 w-4 text-[color:var(--codex-text-faint)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && filtered[0]) { onPick(filtered[0]); onClose(); } }}
            placeholder="Go to file…"
            className="codex-mono flex-1 bg-transparent text-sm text-[color:var(--codex-text)] outline-none placeholder:text-[color:var(--codex-text-faint)]"
          />
          <button onClick={onClose} aria-label="Close" className="text-[color:var(--codex-text-faint)] hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="codex-scroll max-h-[50vh] overflow-auto p-1.5">
          {filtered.map((f) => (
            <button key={f.id} onClick={() => { onPick(f); onClose(); }} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm text-[color:var(--codex-text)] hover:bg-white/5">
              <span className={`h-1.5 w-1.5 shrink-0 ${fileIconColor(f.name)}`} />
              <span className="codex-mono truncate">{f.name}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-xs text-[color:var(--codex-text-faint)]">No files match.</p>}
        </div>
      </div>
    </Overlay>
  );
}

export function CodexConfirmDialog({ open, title, description, confirmLabel = "Delete", onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <Overlay onClose={onCancel} align="center">
      <div className="codex-panel mx-auto max-w-sm p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-[color:var(--codex-red)]">
          <AlertTriangle className="h-4 w-4" />
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <p className="text-xs text-[color:var(--codex-text-dim)]">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="border border-[color:var(--codex-border)] px-3 py-1.5 text-xs text-[color:var(--codex-text-dim)] hover:text-white">Cancel</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs font-medium" style={{ background: "var(--codex-red)", color: "#1a0509" }}>{confirmLabel}</button>
        </div>
      </div>
    </Overlay>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { COMMANDS, PALETTE_TABS } from "../../lib/commands";

export default function CommandPalette({ open, onClose, onPick }) {
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ(""); setTab(0);
    setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^\//, "");
    if (!t) return PALETTE_TABS[tab][1];
    return COMMANDS.filter((c) => c.command.slice(1).includes(t) || c.desc.toLowerCase().includes(t));
  }, [q, tab]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0b]/95 shadow-2xl shadow-black/60" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 text-neutral-500" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every Xyron command…" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-600" />
          <button onClick={onClose} className="text-neutral-500 hover:text-white" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {!q.trim() && (
          <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2">
            {PALETTE_TABS.map(([name], i) => (
              <button key={name} onClick={() => setTab(i)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${i === tab ? "bg-white text-black" : "text-neutral-400 hover:bg-white/10 hover:text-white"}`}>{name}</button>
            ))}
          </div>
        )}
        <div className="xcode-scroll grid max-h-[50vh] gap-1 overflow-y-auto p-2 sm:grid-cols-2">
          {items.map((c) => (
            <button key={c.command} onClick={() => onPick(c)} className="rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10">
              <span className="block text-sm font-medium text-white">{c.command}</span>
              <span className="block truncate text-[11px] text-neutral-500">{c.desc}</span>
            </button>
          ))}
          {items.length === 0 && <p className="col-span-2 px-3 py-6 text-center text-xs text-neutral-600">No commands match.</p>}
        </div>
        <p className="border-t border-white/10 px-4 py-2 text-[10px] text-neutral-600">Tip: <span className="text-neutral-400">/auto &lt;request&gt;</span> picks the right mode for you · <span className="text-neutral-400">Ctrl/⌘ K</span> opens this anywhere</p>
      </div>
    </div>
  );
}



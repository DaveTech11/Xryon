import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Pencil, X } from "lucide-react";

// Shown under a file the person sent without any words: a scrollable row of things Xyron can do with it,
// plus "Custom", which opens a box to type anything. Whatever is picked is sent pointing at the file.
export function FileActions({ items, options, onPick, onCustom }) {
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState("");
  const boxRef = useRef(null);
  useEffect(() => { if (custom) boxRef.current?.focus(); }, [custom]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onCustom(t);
    setText("");
    setCustom(false);
  };

  return (
    <div className="xyron-file-actions mx-auto w-full max-w-3xl" role="group" aria-label="What should Xyron do with this file?">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-neutral-400">
        <FileText className="h-3.5 w-3.5" />
        <span className="truncate">What should I do with {items.length === 1 ? items[0].name : `these ${items.length} files`}?</span>
      </p>
      {custom ? (
        <form className="flex items-end gap-2 rounded-2xl border border-white/15 bg-[#161616] p-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <textarea
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === "Escape") setCustom(false); }}
            rows={2}
            placeholder="Tell Xyron what you want done with this file…"
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-neutral-500"
          />
          <button type="button" onClick={() => setCustom(false)} aria-label="Cancel" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-neutral-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
          <button type="submit" disabled={!text.trim()} aria-label="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-black disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>
        </form>
      ) : (
        <div className="xyron-chip-row -mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
          {options.map(([label, prompt]) => (
            <button key={label} type="button" onClick={() => onPick(prompt)}
              className="shrink-0 snap-start whitespace-nowrap rounded-full border border-white/15 bg-[#161616] px-4 py-2 text-sm text-neutral-100 transition hover:bg-[#222] active:scale-95">
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setCustom(true)}
            className="flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-white/30 px-4 py-2 text-sm text-white transition hover:bg-white/10 active:scale-95">
            <Pencil className="h-3.5 w-3.5" /> Custom
          </button>
        </div>
      )}
    </div>
  );
}

// Shown when a task was cut off (the app was closed, the reply broke off mid-code, or nothing came back).
export function ContinueChip({ onContinue }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <button type="button" onClick={onContinue}
        className="rounded-full border border-white/15 bg-[#161616] px-4 py-2 text-sm text-neutral-100 transition hover:bg-[#222] active:scale-95">
        Continue from where we stopped
      </button>
    </div>
  );
}

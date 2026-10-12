import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { MODELS, DEFAULT_FREE_MODEL } from "../../lib/models";
import { getSetting, setSetting } from "../../lib/settings";
import { MODEL_ICONS } from "../../lib/modelIcons";
import GptLimitModal from "./GptLimitModal";

// Compact model picker for the chat header. It reads and writes the same
// "selectedModel" setting as Settings -> Model, so both always agree, and it
// applies the same Premium lock rules. The selected model gets a green check.
export default function ModelSwitcher({ isPremium = false, isAdmin = false, className = "" }) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(() => getSetting("selectedModel", DEFAULT_FREE_MODEL));
  const [lockedModel, setLockedModel] = useState(null);
  const rootRef = useRef(null);
  const canUsePremium = isPremium || isAdmin;

  // Re-read when opening, so a change made in Settings is reflected here.
  useEffect(() => { if (open) setModel(getSetting("selectedModel", DEFAULT_FREE_MODEL)); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const choose = (name, premium) => {
    if (premium && !canUsePremium) { setOpen(false); setLockedModel(name); return; }
    setModel(name);
    setSetting("selectedModel", name);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch model"
        className="flex h-9 max-w-[11rem] items-center gap-1.5 rounded-xl border border-white/15 bg-[#151518] px-3 text-xs font-medium text-neutral-200 transition hover:bg-[#222225] hover:text-white"
      >
        <span className="truncate">{model}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="listbox" aria-label="Model" className="absolute left-0 top-11 z-50 max-h-[70vh] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-black p-1.5 shadow-2xl shadow-black/70">
          {MODELS.map(({ name, desc, premium, icon }) => {
            const ModelIcon = MODEL_ICONS[icon];
            const selected = model === name;
            return (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => choose(name, premium)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/10"
              >
                {ModelIcon && <ModelIcon className="h-5 w-5 shrink-0 text-white" strokeWidth={1.75} aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    {name}
                    {premium && !canUsePremium && <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-amber-300">PRO</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-400">{desc}</span>
                </span>
                {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-label="Selected" />}
              </button>
            );
          })}
        </div>
      )}
      <GptLimitModal open={!!lockedModel} onClose={() => setLockedModel(null)} lockedModel={lockedModel} />
    </div>
  );
}

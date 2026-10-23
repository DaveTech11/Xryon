import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Sparkles, Brain, Zap, Shuffle } from "lucide-react";
import { MODELS, MODEL_GROUPS, DEFAULT_FREE_MODEL } from "../../lib/models";
import { getSetting } from "../../lib/settings";

// Compact model button for the chat header. Tapping it shows just the three groups
// (Free, Smart Models, Reasoning); tapping a group opens Settings -> Model at that group,
// where the actual model is chosen (same "selectedModel" setting as before).
// The menu is positioned from the button and kept inside the screen, so it fits any phone.
const GROUP_ICONS = { nexus: Shuffle, free: Zap, smart: Sparkles, reasoning: Brain };
const MENU_WIDTH = 288; // px, shrinks on narrow screens
const GAP = 12;

export default function ModelSwitcher({ className = "" }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(() => getSetting("selectedModel", DEFAULT_FREE_MODEL));
  const [pos, setPos] = useState({ left: GAP, top: 56, width: MENU_WIDTH });
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const currentGroup = MODELS.find((m) => m.name === model)?.group;

  useEffect(() => { if (open) setModel(getSetting("selectedModel", DEFAULT_FREE_MODEL)); }, [open]);

  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vw = window.innerWidth;
    const width = Math.min(MENU_WIDTH, vw - GAP * 2);
    const left = Math.max(GAP, Math.min(rect.left, vw - width - GAP));
    setPos({ left, top: rect.bottom + 8, width });
  };
  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const openGroup = (key) => { setOpen(false); navigate(`/settings?tab=model&group=${key}`); };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch model"
        className="xs-model flex h-9 max-w-[11rem] items-center gap-1.5 rounded-xl border border-white/15 bg-[#151518] px-3 text-xs font-medium text-neutral-200 transition hover:bg-[#222225] hover:text-white"
      >
        <span className="truncate">{model}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Model groups"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width }}
          className="z-50 rounded-2xl border border-white/15 bg-black p-1.5 shadow-2xl shadow-black/70"
        >
          {MODEL_GROUPS.map(({ key, label, desc }) => {
            const Icon = GROUP_ICONS[key] || Sparkles;
            const current = currentGroup === key;
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => openGroup(key)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/10 active:bg-white/15"
              >
                <Icon className="h-5 w-5 shrink-0 text-neutral-300" strokeWidth={1.75} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    {label}
                    {current && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="Current model is in this group" />}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-neutral-400">{desc}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

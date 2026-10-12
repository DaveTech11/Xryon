import React from "react";
import { MoreHorizontal } from "lucide-react";

// The narrow icon rail on the far left of Codex (desktop only), shared by the home screen and the
// workspace. `items` are the main icons; `onMenu` opens the app menu under the divider.
export default function CodexRail({ items = [], onMenu, className = "" }) {
  return (
    <nav aria-label="Codex" className={`hidden w-[68px] shrink-0 flex-col items-center gap-3 border-r border-white/[0.06] bg-[#1b1b1b] py-4 md:flex ${className}`}>
      {items.map(({ icon: Icon, label, onClick, active }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          title={label}
          className={`grid h-11 w-11 place-items-center !rounded-2xl transition ${active ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-neutral-200"}`}
        >
          <Icon className="h-[22px] w-[22px]" strokeWidth={1.7} />
        </button>
      ))}
      <div className="my-1 h-px w-6 bg-white/10" />
      <button type="button" onClick={onMenu} aria-label="Menu" title="Menu" className="grid h-11 w-11 place-items-center !rounded-2xl text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200">
        <MoreHorizontal className="h-[22px] w-[22px]" strokeWidth={1.7} />
      </button>
    </nav>
  );
}

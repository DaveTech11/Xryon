import React from "react";

export default function EmptyState({ onPick }) {
  return (
    <div className="xyron-empty mx-auto flex h-full max-w-xl flex-col items-center justify-center px-4 pb-8 text-center md:hidden">
      <div className="hidden text-4xl font-black tracking-tight md:block">Xyron</div>
      <p className="mt-3 text-sm text-neutral-500">Ask anything, write code, or start with an idea.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {["Explain this code", "Build a landing page", "Help me debug"].map((x) => (
          <button key={x} onClick={() => onPick(x)} className="rounded-full border border-white/10 px-4 py-2 text-xs text-neutral-400 transition hover:bg-white/5 hover:text-white">{x}</button>
        ))}
      </div>
    </div>
  );
}

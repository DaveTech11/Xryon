import React, { useEffect, useState } from "react";

// Laptop-only right-hand panel on the auth pages: the Xyron "X" and a line of text that types
// itself out, holds, erases and moves on to the next one (a static, fading version is used
// for people who prefer reduced motion).
const LINES = [
  "Xyron — your AI, built for you.",
  "Built to help you code, write and create.",
  "Ask anything. Get fast, clear answers.",
  "Turn ideas into real projects in minutes.",
  "Photos, files and images — Xyron understands them.",
  "Your ideas. Your AI. One place.",
];

function useTypewriter(lines) {
  const [text, setText] = useState("");
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    let line = 0, chars = 0, deleting = false, timer;
    const tick = () => {
      const full = lines[line];
      if (reduce) {
        setText(full);
        line = (line + 1) % lines.length;
        timer = setTimeout(tick, 3200);
        return;
      }
      if (!deleting) {
        chars++;
        setText(full.slice(0, chars));
        if (chars === full.length) { deleting = true; timer = setTimeout(tick, 1900); return; }
        timer = setTimeout(tick, 42);
      } else {
        chars -= 2;
        setText(full.slice(0, Math.max(0, chars)));
        if (chars <= 0) { deleting = false; chars = 0; line = (line + 1) % lines.length; timer = setTimeout(tick, 350); return; }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
  }, [lines, reduce]);

  return text;
}

export default function AuthBrandPanel() {
  const text = useTypewriter(LINES);
  return (
    <aside className="auth-brand relative hidden aspect-[4/5] w-[min(32vw,57vh,460px)] shrink-0 overflow-hidden rounded-[28px] lg:block" aria-label="About Xyron">
      <div className="auth-brand-glow" aria-hidden="true" />
      <img
        src="/brand/xyron-x.jpg"
        alt="Xyron logo"
        width="720"
        height="720"
        decoding="async"
        draggable={false}
        className="auth-brand-img absolute left-1/2 top-[6%] w-[80%] -translate-x-1/2 select-none"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#02040c] via-[#02040c]/80 to-transparent px-6 pb-6 pt-20 text-center">
        <p className="min-h-[3.5rem] text-lg font-semibold xl:text-xl leading-snug tracking-tight text-white" aria-live="off">
          {text}<span className="auth-caret" aria-hidden="true" />
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.3em] text-blue-200/50">Beta · under development</p>
      </div>
    </aside>
  );
}

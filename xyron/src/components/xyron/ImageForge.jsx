import React, { useEffect, useMemo, useState } from "react";

const STAGES = ["Understanding prompt", "Building composition", "Rendering details", "Finalizing image"];
const GLYPHS = ["✦", "◈", "◇", "◆"];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

// A handful of small particles drifting toward the X-shaped core. Purely
// decorative; each has a randomized-but-stable angle/delay so re-renders
// (e.g. stage text changing) don't reshuffle them.
function Particles({ count = 10 }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + (i % 2 ? 12 : -8);
    return { id: i, angle, delay: (i * 0.17) % 2, dur: 1.8 + (i % 4) * 0.25 };
  }), [count]);
  return (
    <>
      {particles.map((p) => (
        <span
          key={p.id}
          className="forge-particle"
          style={{ "--angle": `${p.angle}deg`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s` }}
        />
      ))}
    </>
  );
}

function ForgeCore({ reduced }) {
  return (
    <div className="relative grid h-24 w-24 place-items-center">
      {!reduced && (
        <div className="absolute inset-0">
          <Particles />
        </div>
      )}
      <div className={`absolute inset-0 rounded-full border border-white/10 ${reduced ? "" : "forge-ring"}`} />
      <div className={`absolute inset-3 rounded-full border border-white/[0.07] ${reduced ? "" : "forge-ring-reverse"}`} />
      {/* Four corner brackets, subtly breathing inward. */}
      <svg viewBox="0 0 96 96" className={`absolute inset-0 h-full w-full ${reduced ? "" : "forge-brackets"}`} fill="none">
        <g stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 18V8h10" /><path d="M78 8h10v10" /><path d="M88 78v10H78" /><path d="M18 88H8V78" />
        </g>
      </svg>
      <div className={`relative grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-white/25 to-white/5 text-lg text-white ${reduced ? "" : "forge-core-pulse"}`}>
        <span className={reduced ? "" : "forge-glyph-spin"} aria-hidden>✕</span>
      </div>
    </div>
  );
}

export default function ImageForge({ active, prompt = "", regenerating = false, previousImageUrl = null }) {
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!active) { setStage(0); return; }
    const t = setInterval(() => setStage((s) => (s + 1) % STAGES.length), reduced ? 1400 : 1100);
    return () => clearInterval(t);
  }, [active, reduced]);

  if (!active) return null;

  return (
    <div className="flex max-w-3xl flex-col items-center gap-4 rounded-3xl border border-white/10 bg-[#0a0a0b]/95 px-6 py-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">
      <div className="relative">
        {regenerating && previousImageUrl && (
          <img
            src={previousImageUrl}
            alt=""
            className={`absolute inset-0 -z-10 h-24 w-24 rounded-2xl object-cover ${reduced ? "opacity-20" : "forge-dissolve"}`}
          />
        )}
        <ForgeCore reduced={reduced} />
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span aria-hidden>{GLYPHS[stage]}</span>
        <span key={stage} className={reduced ? "" : "forge-stage-in"}>
          {regenerating ? "Regenerating" : "Xyron is creating"} — {STAGES[stage]}
        </span>
      </div>
      {prompt && <p className="max-w-xs truncate text-center text-[11px] text-neutral-600">"{prompt}"</p>}

      <style>{`
        .forge-particle {
          position: absolute; top: 50%; left: 50%; width: 3px; height: 3px;
          margin: -1.5px; border-radius: 9999px; background: rgba(255,255,255,0.55);
          transform: rotate(var(--angle)) translateX(46px);
          animation-name: forge-drift; animation-timing-function: ease-in;
          animation-iteration-count: infinite;
        }
        @keyframes forge-drift {
          0% { transform: rotate(var(--angle)) translateX(46px); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: rotate(var(--angle)) translateX(6px); opacity: 0; }
        }
        .forge-ring { animation: forge-spin 5s linear infinite; }
        .forge-ring-reverse { animation: forge-spin 4s linear infinite reverse; }
        @keyframes forge-spin { to { transform: rotate(360deg); } }
        .forge-brackets { animation: forge-breathe 2.4s ease-in-out infinite; transform-origin: center; }
        @keyframes forge-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(0.92); } }
        .forge-core-pulse { animation: forge-pulse 1.6s ease-in-out infinite; }
        @keyframes forge-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.12); } 50% { box-shadow: 0 0 0 10px rgba(255,255,255,0); } }
        .forge-glyph-spin { display: inline-block; animation: forge-glyph-spin 3.2s linear infinite; }
        @keyframes forge-glyph-spin { to { transform: rotate(360deg); } }
        .forge-stage-in { animation: forge-fade-up 0.35s ease-out; }
        @keyframes forge-fade-up { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }
        .forge-dissolve { animation: forge-dissolve 1.1s ease-out forwards; }
        @keyframes forge-dissolve { from { opacity: 0.35; filter: blur(0px); } to { opacity: 0; filter: blur(6px); } }
      `}</style>
    </div>
  );
}


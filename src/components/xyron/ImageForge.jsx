import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";

// In-chat image canvas shown while an image is being generated.
//
// The image provider (see imagegen.mjs) returns a finished image, not
// intermediate previews, so the sketch below is a purely decorative loading
// animation - it is NOT a preview of the real image and is never presented as
// one. The real image is revealed by <GeneratedImage> (MessageBubble.jsx) the
// moment it arrives.

const STATUS = ["Creating your image…", "Bringing your idea to life…"];

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
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

// Generic sketch strokes (pathLength=1 so one dash value fits every path).
const STROKES = [
  { d: "M8 8H92V92H8Z", delay: 0 },
  { d: "M8 70C24 60 38 74 56 64S86 58 92 66", delay: 0.5 },
  { d: "M8 84C22 72 36 80 50 72S78 68 92 78", delay: 0.9 },
  { d: "M62 28a10 10 0 1 0 20 0a10 10 0 1 0-20 0", delay: 1.3 },
  { d: "M20 30C26 22 34 22 40 30", delay: 1.7 },
  { d: "M28 54L40 40L52 54", delay: 2.0 },
];

export default function ImageForge({ active, regenerating = false, previousImageUrl = null, ratio = 1 }) {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);

  // The interval is always cleared on stop / unmount.
  useEffect(() => {
    if (!active) { setI(0); return undefined; }
    const t = setInterval(() => setI((s) => (s + 1) % STATUS.length), 3200);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <div role="status" aria-live="polite" aria-busy="true" className="w-full max-w-md sm:max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <div className="relative w-full overflow-hidden bg-black/40" style={{ aspectRatio: String(ratio), maxHeight: "70vh" }}>
          {regenerating && previousImageUrl && (
            <img src={previousImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-md" />
          )}
          <div className={`absolute inset-0 ${reduced ? "" : "xf-shimmer"}`} aria-hidden />
          {!reduced && (
            <>
              <span className="xf-wash xf-wash-a" aria-hidden />
              <span className="xf-wash xf-wash-b" aria-hidden />
            </>
          )}
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" fill="none" aria-hidden>
            <g stroke="rgba(255,255,255,0.5)" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round">
              {STROKES.map((s, n) => (
                <path
                  key={n}
                  d={s.d}
                  pathLength="1"
                  className={reduced ? "xf-static" : "xf-stroke"}
                  style={reduced ? undefined : { animationDelay: `${s.delay}s` }}
                />
              ))}
            </g>
          </svg>
          {!reduced && <Pencil className="xf-pencil h-5 w-5 text-white/80" strokeWidth={1.75} aria-hidden />}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400">
          <Pencil className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
          <span key={i} className={reduced ? "" : "xf-text-in"}>{regenerating && i === 0 ? "Re-creating your image…" : STATUS[i]}</span>
        </div>
      </div>

      <style>{`
        .xf-shimmer { background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.06) 50%, transparent 70%); background-size: 250% 100%; animation: xf-shimmer 2.2s linear infinite; }
        @keyframes xf-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
        .xf-stroke { stroke-dasharray: 1; stroke-dashoffset: 1; animation: xf-draw 6s ease-in-out infinite; }
        @keyframes xf-draw {
          0% { stroke-dashoffset: 1; opacity: 1; }
          45% { stroke-dashoffset: 0; opacity: 1; }
          85% { stroke-dashoffset: 0; opacity: 0.9; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        .xf-static { stroke-dasharray: 1; stroke-dashoffset: 0; opacity: 0.45; }
        .xf-wash { position: absolute; border-radius: 9999px; filter: blur(28px); opacity: 0; animation: xf-wash 6s ease-in-out infinite; }
        .xf-wash-a { width: 55%; height: 55%; left: 8%; top: 12%; background: rgba(120,140,255,0.35); animation-delay: 1.8s; }
        .xf-wash-b { width: 50%; height: 50%; right: 6%; bottom: 8%; background: rgba(255,170,120,0.3); animation-delay: 2.4s; }
        @keyframes xf-wash { 0%, 30% { opacity: 0; } 60% { opacity: 1; } 90%, 100% { opacity: 0; } }
        .xf-pencil { position: absolute; left: 0; top: 0; will-change: transform; animation: xf-pencil 6s ease-in-out infinite; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6)); }
        @keyframes xf-pencil {
          0% { transform: translate(8%, 8%) rotate(-10deg); }
          15% { transform: translate(55%, 18%) rotate(8deg); }
          30% { transform: translate(30%, 55%) rotate(-6deg); }
          45% { transform: translate(78%, 62%) rotate(10deg); }
          65% { transform: translate(40%, 78%) rotate(-8deg); }
          85% { transform: translate(70%, 30%) rotate(6deg); }
          100% { transform: translate(8%, 8%) rotate(-10deg); }
        }
        .xf-text-in { display: inline-block; animation: xf-text-in 0.35s ease-out; }
        @keyframes xf-text-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  );
}

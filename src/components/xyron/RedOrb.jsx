import React, { useEffect, useRef, useState } from "react";

/**
 * Xyron's signature "thinking" indicator — a small animated red energy orb.
 * Always mount this component; toggle `active` to show/hide it. It handles
 * its own mount/unmount timing so it fades in immediately and dissolves
 * out smoothly instead of popping in/out with the parent's conditional.
 *
 *   <RedOrb active={thinking} />
 *
 * `size` controls the pixel diameter of the core orb (default 64).
 */
export default function RedOrb({ active, size = 64 }) {
  const [mounted, setMounted] = useState(active);
  const [entered, setEntered] = useState(false);
  const hideTimer = useRef(null);
  const enterFrame = useRef(null);

  useEffect(() => {
    if (active) {
      clearTimeout(hideTimer.current);
      setMounted(true);
      // Let the element paint in its "leaving" state for one frame before
      // flipping the class, so the enter transition actually animates.
      enterFrame.current = requestAnimationFrame(() => setEntered(true));
    } else {
      setEntered(false);
      hideTimer.current = setTimeout(() => setMounted(false), 420);
    }
    return () => {
      clearTimeout(hideTimer.current);
      cancelAnimationFrame(enterFrame.current);
    };
  }, [active]);

  if (!mounted) return null;

  const glow = Math.round(size * 2.75);

  return (
    <div
      className={`xr-orb-wrap ${entered ? "xr-orb-in" : "xr-orb-out"}`}
      style={{ "--xr-size": `${size}px`, "--xr-glow": `${glow}px` }}
      role="status"
      aria-label="Xyron is generating a response"
    >
      <div className="xr-orb-stage">
        <div className="xr-orb-halo" />
        <div className="xr-orb-particles">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className={`xr-orb-particle xr-orb-particle-${i}`} />
          ))}
        </div>
        <div className="xr-orb-breathe">
          <div className="xr-orb-morph">
            <div className="xr-orb-core">
              <div className="xr-orb-flow xr-orb-flow-a" />
              <div className="xr-orb-flow xr-orb-flow-b" />
              <div className="xr-orb-flow xr-orb-flow-c" />
              <div className="xr-orb-sheen" />
              <div className="xr-orb-highlight" />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .xr-orb-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px 0;
          transition: opacity 380ms cubic-bezier(.22,.9,.3,1), transform 380ms cubic-bezier(.22,.9,.3,1), filter 380ms ease;
          will-change: opacity, transform, filter;
        }
        .xr-orb-out {
          opacity: 0;
          transform: scale(0.82);
          filter: blur(6px);
        }
        .xr-orb-in {
          opacity: 1;
          transform: scale(1);
          filter: blur(0px);
        }

        .xr-orb-stage {
          position: relative;
          width: var(--xr-glow);
          height: var(--xr-glow);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Soft outer bloom, pulsing in sync with the breathing core */
        .xr-orb-halo {
          position: absolute;
          width: var(--xr-glow);
          height: var(--xr-glow);
          border-radius: 50%;
          background: radial-gradient(circle,
            rgba(255,45,60,0.35) 0%,
            rgba(200,16,40,0.18) 32%,
            rgba(120,8,24,0.08) 55%,
            rgba(120,8,24,0) 72%);
          filter: blur(2px);
          animation: xr-halo-pulse 3.2s ease-in-out infinite;
        }

        .xr-orb-breathe {
          animation: xr-breathe 3.2s ease-in-out infinite;
        }

        .xr-orb-morph {
          width: var(--xr-size);
          height: var(--xr-size);
          animation: xr-morph 6.4s ease-in-out infinite;
          overflow: hidden;
          box-shadow:
            0 0 calc(var(--xr-size) * 0.5) rgba(255, 30, 50, 0.65),
            0 0 calc(var(--xr-size) * 1.1) rgba(200, 10, 40, 0.35),
            inset 0 0 calc(var(--xr-size) * 0.18) rgba(0,0,0,0.55);
        }

        .xr-orb-core {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: inherit;
          background:
            radial-gradient(circle at 35% 30%, rgba(255,120,120,0.9) 0%, rgba(255,40,55,0.95) 22%, rgba(178,10,30,1) 55%, rgba(90,4,14,1) 100%);
          overflow: hidden;
        }

        /* Three overlapping flowing gradients = "energy shifting inside" */
        .xr-orb-flow {
          position: absolute;
          inset: -30%;
          border-radius: 50%;
          mix-blend-mode: screen;
          opacity: 0.75;
        }
        .xr-orb-flow-a {
          background: conic-gradient(from 0deg, transparent 0deg, rgba(255,70,70,0.55) 60deg, transparent 140deg, rgba(255,0,40,0.5) 230deg, transparent 320deg, transparent 360deg);
          animation: xr-spin 5.5s linear infinite;
        }
        .xr-orb-flow-b {
          background: conic-gradient(from 180deg, transparent 0deg, rgba(255,120,90,0.4) 90deg, transparent 170deg, rgba(140,0,30,0.55) 260deg, transparent 340deg);
          animation: xr-spin-rev 8s linear infinite;
        }
        .xr-orb-flow-c {
          background: radial-gradient(circle at 60% 70%, rgba(255,60,60,0.5), transparent 55%);
          animation: xr-drift 4.2s ease-in-out infinite;
        }

        /* Glossy highlight sweeping across the surface */
        .xr-orb-sheen {
          position: absolute;
          top: -10%;
          left: -60%;
          width: 60%;
          height: 120%;
          background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 48%, rgba(255,255,255,0.05) 62%, transparent 75%);
          transform: rotate(8deg);
          animation: xr-sheen-sweep 3.6s ease-in-out infinite;
          mix-blend-mode: screen;
        }
        .xr-orb-highlight {
          position: absolute;
          top: 18%;
          left: 24%;
          width: 22%;
          height: 16%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,255,255,0) 70%);
          filter: blur(1px);
          animation: xr-highlight-move 5s ease-in-out infinite;
        }

        /* Tiny particles orbiting the orb */
        .xr-orb-particles {
          position: absolute;
          inset: 0;
        }
        .xr-orb-particle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: radial-gradient(circle, #ffb3b3 0%, #ff2c3c 55%, rgba(255,44,60,0) 100%);
          box-shadow: 0 0 6px 1px rgba(255,45,60,0.85);
          transform-origin: 0 0;
        }
        .xr-orb-particle-0 { animation: xr-orbit-0 4.8s linear infinite; }
        .xr-orb-particle-1 { animation: xr-orbit-1 6.2s linear infinite reverse; }
        .xr-orb-particle-2 { animation: xr-orbit-2 5.4s linear infinite; }
        .xr-orb-particle-3 { animation: xr-orbit-3 7s linear infinite reverse; }
        .xr-orb-particle-4 { animation: xr-orbit-4 5.9s linear infinite; }
        .xr-orb-particle-5 { animation: xr-orbit-5 6.7s linear infinite reverse; }

        @keyframes xr-breathe {
          0%, 100% { transform: scale(0.94); }
          50% { transform: scale(1.07); }
        }
        @keyframes xr-halo-pulse {
          0%, 100% { transform: scale(0.92); opacity: 0.75; }
          50% { transform: scale(1.12); opacity: 1; }
        }
        @keyframes xr-morph {
          0%, 100% { border-radius: 46% 54% 58% 42% / 48% 44% 56% 52%; }
          25% { border-radius: 58% 42% 44% 56% / 40% 58% 42% 60%; }
          50% { border-radius: 50% 50% 50% 50% / 58% 50% 50% 42%; }
          75% { border-radius: 42% 58% 52% 48% / 54% 46% 60% 40%; }
        }
        @keyframes xr-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes xr-spin-rev {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes xr-drift {
          0%, 100% { transform: translate(0%, 0%) scale(1); opacity: 0.5; }
          50% { transform: translate(-8%, -6%) scale(1.15); opacity: 0.8; }
        }
        @keyframes xr-sheen-sweep {
          0% { left: -70%; opacity: 0; }
          15% { opacity: 0.9; }
          55% { left: 90%; opacity: 0.15; }
          100% { left: 90%; opacity: 0; }
        }
        @keyframes xr-highlight-move {
          0%, 100% { top: 18%; left: 24%; opacity: 0.9; }
          50% { top: 26%; left: 34%; opacity: 0.55; }
        }

        @keyframes xr-orbit-0 { from { transform: rotate(0deg) translateX(calc(var(--xr-size) * 0.78)) rotate(0deg); } to { transform: rotate(360deg) translateX(calc(var(--xr-size) * 0.78)) rotate(-360deg); } }
        @keyframes xr-orbit-1 { from { transform: rotate(60deg) translateX(calc(var(--xr-size) * 0.9)) rotate(-60deg); } to { transform: rotate(420deg) translateX(calc(var(--xr-size) * 0.9)) rotate(-420deg); } }
        @keyframes xr-orbit-2 { from { transform: rotate(120deg) translateX(calc(var(--xr-size) * 0.7)) rotate(-120deg); } to { transform: rotate(480deg) translateX(calc(var(--xr-size) * 0.7)) rotate(-480deg); } }
        @keyframes xr-orbit-3 { from { transform: rotate(180deg) translateX(calc(var(--xr-size) * 0.95)) rotate(-180deg); } to { transform: rotate(540deg) translateX(calc(var(--xr-size) * 0.95)) rotate(-540deg); } }
        @keyframes xr-orbit-4 { from { transform: rotate(240deg) translateX(calc(var(--xr-size) * 0.75)) rotate(-240deg); } to { transform: rotate(600deg) translateX(calc(var(--xr-size) * 0.75)) rotate(-600deg); } }
        @keyframes xr-orbit-5 { from { transform: rotate(300deg) translateX(calc(var(--xr-size) * 0.85)) rotate(-300deg); } to { transform: rotate(660deg) translateX(calc(var(--xr-size) * 0.85)) rotate(-660deg); } }

        @media (prefers-reduced-motion: reduce) {
          .xr-orb-breathe, .xr-orb-morph, .xr-orb-flow-a, .xr-orb-flow-b, .xr-orb-flow-c,
          .xr-orb-sheen, .xr-orb-highlight, .xr-orb-halo, .xr-orb-particle {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}


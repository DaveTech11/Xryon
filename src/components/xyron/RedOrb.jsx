import React, { useEffect, useRef, useState } from "react";

/**
 * Xyron's "thinking" indicator: a small dot on the left, where the AI's reply will appear.
 * Always mount this component; toggle `active` to show/hide it. It fades in right away and
 * fades out smoothly instead of popping in and out.
 *
 *   <RedOrb active={thinking} />
 *
 * `size` is the dot's diameter in pixels (default 14).
 * To change the colour, edit DOT_COLOR below.
 */
const DOT_COLOR = "#ffffff";

export default function RedOrb({ active, size = 14 }) {
  const [mounted, setMounted] = useState(active);
  const [entered, setEntered] = useState(false);
  const hideTimer = useRef(null);
  const enterFrame = useRef(null);

  useEffect(() => {
    if (active) {
      clearTimeout(hideTimer.current);
      setMounted(true);
      enterFrame.current = requestAnimationFrame(() => setEntered(true));
    } else {
      setEntered(false);
      hideTimer.current = setTimeout(() => setMounted(false), 260);
    }
    return () => {
      clearTimeout(hideTimer.current);
      cancelAnimationFrame(enterFrame.current);
    };
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      className="xr-dot-wrap"
      style={{ opacity: entered ? 1 : 0, transition: "opacity 240ms ease" }}
      role="status"
      aria-label="Xyron is generating a response"
    >
      <span
        className="xr-dot"
        style={{ width: size, height: size, background: DOT_COLOR, boxShadow: `0 0 ${Math.round(size * 0.7)}px ${DOT_COLOR}66` }}
      />
      <style>{`
        .xr-dot-wrap { display: flex; align-items: center; justify-content: flex-start; padding: 6px 4px; }
        .xr-dot { display: block; border-radius: 50%; animation: xr-dot-pulse 1.2s ease-in-out infinite; }
        @keyframes xr-dot-pulse {
          0%, 100% { transform: scale(0.8); opacity: 0.7; }
          50% { transform: scale(1.1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) { .xr-dot { animation: none; } }
      `}</style>
    </div>
  );
}

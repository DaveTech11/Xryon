import React from "react";
import { Music2 } from "lucide-react";

export const ACCENT = "#ffffff";
export const PAGE_BG = "#000000";

export function fmt(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Cover art with a purple placeholder if the picture is missing or fails to load.
export function Cover({ src, className = "", size = 56, rounded = "rounded-xl", iconSize = 20 }) {
  const [bad, setBad] = React.useState(false);
  React.useEffect(() => setBad(false), [src]);
  return (
    <div
      className={`relative shrink-0 overflow-hidden ${rounded} ${className}`}
      style={{ width: size, height: size, background: "linear-gradient(135deg,#262626,#0a0a0a)" }}
    >
      {src && !bad ? (
        <img src={src} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setBad(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-white/40"><Music2 style={{ width: iconSize, height: iconSize }} /></div>
      )}
    </div>
  );
}

// Three bars that dance while a song plays.
export function Equalizer({ active }) {
  return (
    <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-white"
          style={{ height: active ? undefined : "35%", animation: active ? `xyEq 0.9s ${i * 0.18}s ease-in-out infinite alternate` : "none", minHeight: 4 }}
        />
      ))}
      <style>{`@keyframes xyEq{from{height:25%}to{height:100%}}`}</style>
    </span>
  );
}

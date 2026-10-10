import React from "react";

export default function Logo({ size = 48, className = "" }) {
  return (
    <div
      aria-label="Xyron"
      className={`grid place-items-center rounded-2xl border border-white/15 bg-white text-black font-black tracking-tight shadow-lg ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.28) }}
    >
      xG
    </div>
  );
}


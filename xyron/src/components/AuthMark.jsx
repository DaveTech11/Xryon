// Dedicated wordmark for the auth pages (Login/Register/Forgot/Reset), kept
// separate from the compact <Logo/> used in the sidebar so this redesign
// can't affect anything else that already renders <Logo/>.
import React from "react";

export default function AuthMark({ size = 84 }) {
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" className="drop-shadow-[0_0_24px_rgba(255,255,255,0.15)]">
        <defs>
          <linearGradient id="xyron-x" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="55%" stopColor="#cfcfd4" />
            <stop offset="100%" stopColor="#6d6d74" />
          </linearGradient>
        </defs>
        <path d="M12 12 L45 50 L12 88 L28 88 L53 58 L78 88 L94 88 L61 50 L94 12 L78 12 L53 42 L28 12 Z" fill="url(#xyron-x)" />
      </svg>
      <p className="mt-3 text-2xl font-bold tracking-[0.35em] text-white">XYRON</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-neutral-500">Your AI. Your workspace. Your control.</p>
      <span className="mt-3 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400">
        Beta &middot; Under development
      </span>
    </div>
  );
}

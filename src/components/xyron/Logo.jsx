import React from "react";

// The Xyron mark: a bold X where one stroke is cut through the middle. Draws in the current text colour (white by default).
export default function Logo({ size = 48, className = "" }) {
  return (
    <svg
      role="img"
      aria-label="Xyron"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`shrink-0 text-white ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="12"
    >
      <path d="M9 9 L55 55" />
      <path d="M55 9 L38 26" />
      <path d="M26 38 L9 55" />
    </svg>
  );
}

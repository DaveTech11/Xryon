import { useEffect, useRef } from "react";

// Phone gesture for the history sidebar: start a swipe at the left edge of the screen and drag right to open it,
// swipe left while it is open to close it. Touch only, so it never affects desktop mouse use.
const EDGE_PX = 40;       // a swipe has to start this close to the left edge to open the sidebar
const MIN_DX = 60;        // how far the finger has to travel horizontally
const MAX_SLOPE = 0.6;    // mostly sideways: vertical travel may be at most 60% of horizontal travel

export default function useEdgeSwipe({ isOpen, onOpen, onClose, enabled = true }) {
  const state = useRef({ isOpen, onOpen, onClose });
  state.current = { isOpen, onOpen, onClose };

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    let start = null;

    const onStart = (e) => {
      if (e.touches.length !== 1) { start = null; return; }
      const t = e.touches[0];
      const open = state.current.isOpen;
      // Let horizontally scrollable things (code blocks, tables) and text fields keep their own swipes.
      const el = e.target instanceof Element ? e.target : null;
      if (!open && el?.closest("input, textarea, [contenteditable='true'], pre, table, [data-no-swipe]")) { start = null; return; }
      if (!open && t.clientX > EDGE_PX) { start = null; return; }
      start = { x: t.clientX, y: t.clientY, open };
    };

    const onEnd = (e) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      const { open } = start;
      start = null;
      if (Math.abs(dx) < MIN_DX || dy > Math.abs(dx) * MAX_SLOPE) return;
      if (!open && dx > 0 && window.matchMedia?.("(max-width: 767px)").matches) state.current.onOpen();
      else if (open && dx < 0) state.current.onClose();
    };

    const onCancel = () => { start = null; };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled]);
}

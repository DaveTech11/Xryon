import { useEffect, useRef } from "react";

// Keeps the chat box snug against the on-screen keyboard on phones.
//  - Sets --kb (px of keyboard covering the page), --vvh and --vvtop (the visible area) on <html>. Browsers that already shrink the page for the
//    keyboard (Chrome with interactive-widget=resizes-content) report 0 here, so nothing is applied twice.
//  - Adds the "kb-open" class on <html> while a text box is focused on a phone, so the CSS can tighten spacing.
export function useKeyboardInset(onChange) {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const root = document.documentElement;
    const vv = window.visualViewport;
    const phone = () => window.matchMedia?.("(max-width: 767px)").matches;
    let lastKb = 0;
    let typing = false;
    let blurTimer = 0;

    const isField = (el) => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|file|range|color)$/i.test(el.type)) || el.isContentEditable);

    const apply = () => {
      const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      const real = kb > 80 ? kb : 0; // ignore browser toolbar show/hide jitter
      root.style.setProperty("--kb", `${real}px`);
      // The visible area (above the keyboard) for screens that size themselves to it, like Codex on phones.
      root.style.setProperty("--vvh", `${Math.round(vv ? vv.height : window.innerHeight)}px`);
      root.style.setProperty("--vvtop", `${Math.round(vv ? vv.offsetTop : 0)}px`);
      root.classList.toggle("kb-open", phone() && (real > 0 || typing));
      if (real !== lastKb) { lastKb = real; cb.current?.(real); }
    };
    const onFocusIn = (e) => { if (isField(e.target)) { clearTimeout(blurTimer); typing = true; apply(); setTimeout(apply, 250); } };
    const onFocusOut = () => { clearTimeout(blurTimer); blurTimer = setTimeout(() => { typing = isField(document.activeElement); apply(); }, 120); };

    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    apply();
    return () => {
      clearTimeout(blurTimer);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.style.removeProperty("--kb");
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvtop");
      root.classList.remove("kb-open");
    };
  }, []);
}

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Code2, X } from "lucide-react";

// Shown to everyone except admins when they tap Codex. Black, rounded-edge
// square with a notification inside and an X to close it.
export default function CodexComingSoon({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[220] grid place-items-center bg-black/60 px-5 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Codex coming soon"
    >
      <motion.div
        initial={{ scale: 0.9, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex aspect-square w-[min(20rem,86vw)] flex-col items-center justify-center rounded-3xl border border-white/10 bg-black p-6 text-center shadow-2xl shadow-black/70"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
          <Code2 className="h-7 w-7 text-white" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-white">Codex Coming Soon</h2>
        <p className="mt-2 text-sm text-neutral-400">Still under development</p>
      </motion.div>
    </motion.div>,
    document.body
  );
}

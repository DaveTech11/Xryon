import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Construction } from "lucide-react";

// Bump the version to show the notice again to everyone (e.g. after big changes).
const KEY = "xyron_dev_notice_v1";

// One-time, dismissible heads-up that the site is still under development.
export default function DevNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch { /* storage unavailable */ }
    if (seen) return;
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="fixed bottom-4 left-1/2 z-[190] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-white/10 bg-black p-4 shadow-2xl shadow-black/60"
          role="status"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-500/15">
              <Construction className="h-4 w-4 text-amber-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">Xyron is still under development</p>
              <p className="mt-1 text-xs leading-5 text-neutral-400">
                We're building fast. You may run into bugs or missing features, and things may change. Thanks for bearing with us.
              </p>
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 h-9 rounded-full bg-white px-5 text-xs font-medium text-black hover:bg-neutral-200"
              >
                Got it
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

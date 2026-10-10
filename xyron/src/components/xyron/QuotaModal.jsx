import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, Hourglass } from "lucide-react";
import { getQuotaResetMs, formatQuotaReset } from "../../lib/settings";

export default function QuotaModal({ open, onClose, kind = "message" }) {
  const [resetIn, setResetIn] = useState(() => getQuotaResetMs(kind));

  useEffect(() => {
    if (!open) return;
    setResetIn(getQuotaResetMs(kind));
    const id = setInterval(() => setResetIn(getQuotaResetMs(kind)), 30000);
    return () => clearInterval(id);
  }, [open, kind]);

  if (!open) return null;

  const label = kind === "image" ? "image generation" : "message";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-xs rounded-md border border-white/10 bg-black p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-md text-neutral-500 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="grid h-10 w-10 place-items-center rounded-md border border-white/10 bg-white/5">
          <Hourglass className="h-4.5 w-4.5 text-amber-400" />
        </div>

        <h2 className="mt-3.5 text-sm font-semibold text-white">You've used your token quota</h2>
        <p className="mt-1.5 text-xs leading-5 text-neutral-400">
          Free plan {label} quota reached. Wait{" "}
          <span className="font-medium text-neutral-200">{formatQuotaReset(resetIn)}</span> for it to reset,
          or upgrade for a much higher limit.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-white/10 bg-transparent px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/5 hover:text-white"
          >
            OK
          </button>
          <Link
            to="/premium"
            onClick={onClose}
            className="flex-1 rounded-md bg-white px-3 py-2 text-center text-xs font-semibold text-black hover:bg-neutral-200"
          >
            Upgrade
          </Link>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { FileText, Image as ImageIcon, X, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export default function LimitUpgradeModal({ open, onClose, reached = [], uploaded = false }) {
  if (!open) return null;
  const unique = [...new Set(reached)];
  const title = unique.length ? "Your free limit has been reached" : "Upgrade your Xyron experience";
  const copy = unique.length
    ? `${unique.join(", ")} ${unique.length === 1 ? "has" : "have"} reached the free limit of 5. Upgrade to Premium to continue using the service.`
    : "Upgrade to Premium for faster file uploads and more extended features.";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10">
            {unique.length ? <FileText className="h-5 w-5 text-white" /> : <ImageIcon className="h-5 w-5 text-white" />}
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-5 text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-400">{copy}</p>
        {uploaded && !unique.length && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-neutral-300">
            <Sparkles className="h-4 w-4" /> Faster uploads, larger limits and extended features.
          </div>
        )}
        {unique.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {unique.map((item) => (
              <span key={item} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-white">{item}</span>
            ))}
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link to="/premium" onClick={onClose} className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:bg-neutral-200">
            Continue
          </Link>
          <button onClick={onClose} className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/60">
            Learn more
          </button>
        </div>
      </div>
    </div>
  );
}


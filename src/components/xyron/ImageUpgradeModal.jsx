import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

// Shown instead of an error message when image generation fails for a free user.
//   Continue         -> closes the popup and returns to the chat
//   Upgrade to Plus  -> opens the Premium subscription page
export default function ImageUpgradeModal({ open, onClose }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const upgrade = () => { onClose?.(); navigate("/premium"); };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-upgrade-title"
    >
      <div
        className="relative w-full max-w-[540px] overflow-hidden rounded-[28px] border border-white/10 bg-[#1c1c1e] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-neutral-200 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Hero: the Xyron X, fading into the card */}
        <div className="relative h-52 w-full overflow-hidden sm:h-60">
          <img
            src="/popup/xyron-x.jpg"
            alt=""
            draggable="false"
            className="h-full w-full select-none object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#1c1c1e]" />
        </div>

        <div className="px-6 pb-8 pt-1 text-center sm:px-10">
          <h2 id="image-upgrade-title" className="text-2xl font-semibold tracking-tight text-white">
            Couldn&apos;t reach your request
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-[15px] leading-6 text-neutral-400">
            We couldn&apos;t finish your image right now.
          </p>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-6 text-[#6aa7ff]">
            Upgrade to Premium for faster and more efficient image generation.
          </p>

          <div className="mt-8 flex flex-col-reverse items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              onClick={upgrade}
              className="rounded-full bg-[#2c3646] px-6 py-3 text-[15px] font-semibold text-[#6aa7ff] transition hover:bg-[#344156]"
            >
              Upgrade to Plus
            </button>
            <button
              onClick={onClose}
              autoFocus
              className="rounded-full bg-white px-8 py-3 text-[15px] font-semibold text-black transition hover:bg-neutral-200"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

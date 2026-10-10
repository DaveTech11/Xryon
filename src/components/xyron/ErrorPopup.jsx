import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

// Shown instead of any raw backend error in the chat. Raw provider/server
// messages never reach the user (they are logged to the browser console).
//   Continue         -> closes the popup and re-sends the same request
//   Upgrade to plan  -> opens the Premium plan cards (/premium)
// People who already have Premium (or are admins) get "Close" in place of
// "Upgrade to plan", since there is nothing for them to upgrade to.
export default function ErrorPopup({ open, onClose, onContinue, canUpgrade = true }) {
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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="xyron-error-title"
      aria-describedby="xyron-error-desc"
    >
      <div
        className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/15 bg-black shadow-2xl shadow-black"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        {/* The Xyron X, melting into the black card */}
        <div className="relative mx-auto h-44 w-full overflow-hidden sm:h-52">
          <img
            src="/popup/xyron-error.png"
            alt=""
            draggable="false"
            className="h-full w-full select-none object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-black" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-t from-transparent to-black/60" />
        </div>

        <div className="px-6 pb-7 pt-1 text-center sm:px-8">
          <h2 id="xyron-error-title" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Something went wrong
          </h2>
          <p id="xyron-error-desc" className="mx-auto mt-2.5 max-w-xs text-[15px] leading-6 text-neutral-400">
            We couldn&apos;t complete your request right now.{canUpgrade ? " Try again, or upgrade for faster, more reliable responses." : " Please try again."}
          </p>

          <div className="mt-7 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onContinue}
              autoFocus
              className="w-full rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99]"
            >
              Continue
            </button>
            {canUpgrade ? (
              <button
                type="button"
                onClick={upgrade}
                className="w-full rounded-full border border-white/25 bg-transparent px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10 active:scale-[0.99]"
              >
                Upgrade to plan
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-full border border-white/25 bg-transparent px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-white/10 active:scale-[0.99]"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { Link } from "react-router-dom";
import { X, PauseCircle } from "lucide-react";
import { formatClockTime } from "../../lib/settings";

export default function ChatPausedModal({ open, onClose, resetAt, onNewChat }) {
  if (!open) return null;
  const timeLabel = resetAt ? formatClockTime(resetAt) : "";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#111113] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-neutral-500 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
            <PauseCircle className="h-4.5 w-4.5 text-neutral-300" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">
              Chat paused{timeLabel ? ` until usage resets at ${timeLabel}` : ""}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-neutral-400">
              You've reached the limit for chats that include files or images. Start a new text-only chat or upgrade to continue now.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onNewChat}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-neutral-200"
          >
            New chat
          </button>
          <Link
            to="/premium"
            onClick={onClose}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            Upgrade
          </Link>
        </div>
      </div>
    </div>
  );
}

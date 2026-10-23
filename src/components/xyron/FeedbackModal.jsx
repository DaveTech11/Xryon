import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { X, Copy, Check, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../lib/AuthContext";
import { copyToClipboard } from "../../lib/clipboard";

const COPY = {
  feedback: {
    title: "Send feedback",
    sub: "Tell the Xyron team what you like, what's missing, or what could be better.",
    placeholder: "Type your feedback here…",
  },
  bug: {
    title: "Report a bug",
    sub: "What went wrong? Include what you did and what you expected to happen.",
    placeholder: "Describe the bug here…",
  },
};

const SUCCESS_MS = 3000;

// Black popup with an animated check. Shows for exactly 3 seconds, then fades.
function SuccessPopup({ kind, onGone }) {
  const [leaving, setLeaving] = useState(false);
  // Keep the latest callback in a ref so parent re-renders can't restart the 3s timer.
  const goneRef = useRef(onGone);
  goneRef.current = onGone;

  useEffect(() => {
    const fade = setTimeout(() => setLeaving(true), SUCCESS_MS - 300);
    const done = setTimeout(() => goneRef.current?.(), SUCCESS_MS);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[140] grid place-items-center p-4" role="status" aria-live="polite">
      <div className={`${leaving ? "xfb-out" : "xfb-pop"} flex w-full max-w-[300px] flex-col items-center rounded-[28px] border border-white/10 bg-black px-8 py-8 text-center shadow-2xl shadow-black`}>
        <div className="xfb-glow grid h-20 w-20 place-items-center rounded-full">
          <svg viewBox="0 0 64 64" className="h-20 w-20" fill="none" aria-hidden="true">
            <circle className="xfb-ring" cx="32" cy="32" r="28" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" transform="rotate(-90 32 32)" />
            <path className="xfb-tick" d="M20 33.5 L28.5 42 L44.5 24" stroke="#34d399" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="mt-4 text-base font-semibold text-white">{kind === "bug" ? "Bug report sent" : "Feedback sent"}</p>
        <p className="mt-1 text-xs text-neutral-500">Thanks — the admins will see it.</p>
      </div>
    </div>
  );
}

export default function FeedbackModal({ open, kind = "feedback", onClose }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null); // kind of the message that was just sent
  const areaRef = useRef(null);
  const copyTimer = useRef(null);
  const copy = COPY[kind] || COPY.feedback;

  // Fresh box every time it opens.
  useEffect(() => {
    if (!open) return;
    setText(""); setError(""); setCopied(false);
    const t = setTimeout(() => areaRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && !sending) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sending, onClose]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const handleCopy = async () => {
    if (!text.trim()) return;
    try { await copyToClipboard(text); } catch { /* clipboard unavailable */ }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const handleDone = async () => {
    const message = text.trim();
    if (message.length < 3) { setError("Please write a little more before sending."); return; }
    if (!isAuthenticated) { setError("signin"); return; }
    setSending(true); setError("");
    try {
      await api.feedback.send({ type: kind, message, page: location.pathname });
      setSending(false);
      onClose?.();
      setSuccess(kind);
    } catch (e) {
      setSending(false);
      setError(e.message || "Couldn't send right now. Please try again.");
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
          onClick={() => !sending && onClose?.()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="xyron-feedback-title"
        >
          <div
            className="xfb-pop relative w-full max-w-[460px] rounded-[32px] border border-white/15 bg-[#0c0c0e] p-6 shadow-2xl shadow-black sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              aria-label="Cancel"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-neutral-300 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 id="xyron-feedback-title" className="pr-12 text-xl font-semibold tracking-tight text-white">{copy.title}</h2>
            <p className="mt-1.5 pr-6 text-sm text-neutral-500">{copy.sub}</p>

            <textarea
              ref={areaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); if (error) setError(""); }}
              maxLength={3000}
              placeholder={copy.placeholder}
              className="mt-5 h-44 w-full resize-none rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm leading-relaxed text-neutral-100 outline-none transition placeholder:text-neutral-600 focus:border-white/30 focus:bg-white/[0.06]"
            />

            {error === "signin" ? (
              <p className="mt-2 px-1 text-xs text-amber-300">
                Please <Link to="/login" onClick={onClose} className="underline hover:text-amber-200">sign in</Link> to send this to the admins. You can still copy it.
              </p>
            ) : error ? (
              <p className="mt-2 px-1 text-xs text-red-400">{error}</p>
            ) : (
              <p className="mt-2 px-1 text-right text-[11px] text-neutral-700">{text.length}/3000</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!text.trim()}
                className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleDone}
                disabled={sending || !text.trim()}
                className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                {sending ? "Sending…" : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}
      {success && <SuccessPopup kind={success} onGone={() => setSuccess(null)} />}
    </>
  );
}

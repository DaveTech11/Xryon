import React, { useEffect } from "react";
import { Mail, KeyRound, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import GoogleIcon from "./GoogleIcon";

// Shown when someone who isn't signed in tries to chat. Black card, three round sign-in options
// (all real): Google, email code, and password log in.
const option = "flex h-[52px] w-full items-center justify-center gap-3 rounded-full border border-white/15 bg-[#0d0d0f] px-5 text-[15px] font-semibold text-white transition hover:bg-[#1a1a1d] active:scale-[0.985]";

export default function AuthRequiredModal({ open, onClose }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (path) => { onClose?.(); navigate(path); };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="auth-required-title" onClick={onClose}>
      <div className="relative w-full max-w-[420px] rounded-[28px] border border-white/10 bg-black p-6 pb-5 text-white shadow-2xl shadow-black sm:p-8" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3.5 top-3.5 grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>

        <h2 id="auth-required-title" className="mt-1 text-center text-[22px] font-semibold tracking-tight sm:text-2xl">Log in or sign up</h2>
        <p className="mx-auto mt-2.5 max-w-xs text-center text-sm leading-6 text-neutral-400">
          You&apos;ll get smarter responses, save your history and can upload files, images, and more.
        </p>

        <div className="mt-6 space-y-3">
          <button type="button" onClick={() => api.auth.loginWithProvider("google", "/")} className={option}>
            <GoogleIcon className="h-5 w-5" /> Continue with Google
          </button>
          <button type="button" onClick={() => go("/register?returnTo=/")} className={option}>
            <Mail className="h-5 w-5" /> Continue with email
          </button>
          <button type="button" onClick={() => go("/login?returnTo=/")} className={option}>
            <KeyRound className="h-5 w-5" /> Log in with password
          </button>
        </div>

        <p className="mt-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            Beta · under development
          </span>
        </p>
      </div>
    </div>
  );
}

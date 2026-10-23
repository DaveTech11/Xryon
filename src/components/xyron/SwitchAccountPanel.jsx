import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Plus, Loader2, Mail, ShieldCheck, Trash2, X, Check } from "lucide-react";
import { api } from "../../api/client";
import DockAvatar, { initialsFor, avatarColorFor } from "./DockAvatar";

function AccountRow({ account, badge, action }) {
  const name = (account.full_name || "").trim() || account.username || account.email || "Account";
  return (
    <div className="flex items-center gap-3">
      <DockAvatar url={account.profile_pic_url} initials={initialsFor(account.full_name, account.email)} colorClass={avatarColorFor(account.id || account.email)} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium text-neutral-100">
          <span className="truncate">{name}</span>
          {badge && <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">{badge}</span>}
        </p>
        <p className="truncate text-xs text-neutral-500">{account.email || account.phone || ""}</p>
      </div>
      {action}
    </div>
  );
}

// Settings > Switch Account. One extra "trusted" account can be linked to this one, so you can jump between
// the two without logging out. Linking needs a 6-digit code sent to the other account's email, so nobody can
// attach an account they don't own.
export default function SwitchAccountPanel({ user }) {
  const [linked, setLinked] = useState(null); // null = loading
  const [step, setStep] = useState("idle"); // idle | email | code
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => { setLinked(await api.auth.linkedAccounts()); }, []);
  useEffect(() => { if (user) load(); }, [user?.id, load]);

  if (!user) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm text-neutral-400">Sign in to link and switch between accounts.</p>
        <Link to="/login" className="mt-3 inline-block text-sm text-violet-300 hover:text-violet-200">Sign in →</Link>
      </div>
    );
  }

  const reset = () => { setStep("idle"); setEmail(""); setCode(""); setError(""); };

  const sendCode = async () => {
    const target = email.trim().toLowerCase();
    if (!target) return;
    setBusy(true); setError("");
    try { await api.auth.sendLinkCode(target); setEmail(target); setStep("code"); }
    catch (e) { setError(e.message || "Couldn't send the code."); }
    setBusy(false);
  };

  const confirm = async () => {
    setBusy(true); setError("");
    try { setLinked(await api.auth.linkAccount(email, code.trim())); reset(); }
    catch (e) { setError(e.message || "Couldn't link that account."); }
    setBusy(false);
  };

  const switchTo = async (account) => {
    setSwitching(true); setError("");
    try {
      await api.auth.switchAccount(account.id);
      window.location.assign("/"); // full reload so chats, plan and settings all load for the other account
    } catch (e) { setError(e.message || "Couldn't switch accounts."); setSwitching(false); }
  };

  const remove = async () => {
    setBusy(true); setError("");
    try { setLinked(await api.auth.unlinkAccount()); setConfirmRemove(false); }
    catch (e) { setError(e.message || "Couldn't remove it."); }
    setBusy(false);
  };

  const other = linked?.[0];
  const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5";
  const input = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-white/25";

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">Link a second Xyron account you trust (for example your personal and work accounts) and switch between them in one tap — no logging out.</p>

      <div className={card}>
        <AccountRow account={user} badge="Signed in" />
      </div>

      {linked === null ? (
        <div className={`${card} flex items-center gap-2 text-sm text-neutral-500`}><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : other ? (
        <div className={card}>
          <AccountRow
            account={other}
            action={
              <button type="button" onClick={() => switchTo(other)} disabled={switching} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-50">
                {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />} Switch
              </button>
            }
          />
          <div className="mt-4 border-t border-white/10 pt-3">
            {confirmRemove ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-400">Remove this trusted account? Both accounts will be unlinked.</span>
                <button type="button" onClick={remove} disabled={busy} className="rounded-lg bg-red-500/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50">{busy ? "Removing…" : "Yes, remove"}</button>
                <button type="button" onClick={() => setConfirmRemove(false)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-white/5">Cancel</button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /> Remove trusted account</button>
            )}
          </div>
        </div>
      ) : (
        <div className={card}>
          {step === "idle" && (
            <button type="button" onClick={() => setStep("email")} className="flex w-full items-center gap-3 text-left">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-white/20 text-neutral-300"><Plus className="h-5 w-5" /></span>
              <span>
                <span className="block text-sm font-medium text-neutral-100">Add a trusted account</span>
                <span className="block text-xs text-neutral-500">Link another Xyron account you own.</span>
              </span>
            </button>
          )}

          {step === "email" && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-neutral-100"><Mail className="h-4 w-4 text-neutral-400" /> Which account?</p>
              <p className="text-xs text-neutral-500">Enter the email of the other Xyron account. We'll send it a 6-digit code to prove it's yours.</p>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCode()} placeholder="other-account@email.com" className={input} autoFocus />
              <div className="flex gap-2">
                <button type="button" onClick={sendCode} disabled={busy || !email.trim()} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send code</button>
                <button type="button" onClick={reset} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-neutral-300 hover:bg-white/5">Cancel</button>
              </div>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-neutral-100"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Enter the code</p>
              <p className="text-xs text-neutral-500">We sent a 6-digit code to <span className="text-neutral-300">{email}</span>. It expires in 10 minutes.</p>
              <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && code.length === 6 && confirm()} placeholder="123456" className={`${input} tracking-[0.4em]`} autoFocus />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={confirm} disabled={busy || code.length !== 6} className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200 disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Link account</button>
                <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }} className="rounded-xl border border-white/10 px-4 py-2 text-xs text-neutral-300 hover:bg-white/5">Use a different email</button>
                <button type="button" onClick={reset} className="grid h-8 w-8 place-items-center rounded-xl text-neutral-500 hover:bg-white/5 hover:text-white" aria-label="Cancel"><X className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
      <p className="text-xs text-neutral-600">Each account keeps its own chats, memory and plan. Only one trusted account can be linked at a time.</p>
    </div>
  );
}

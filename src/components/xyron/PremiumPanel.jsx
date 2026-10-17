import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Gift, Loader2, UserCheck } from "lucide-react";
import { api } from "../../api/client";

const TIER_LABEL = { premium: "Premium", premium_plus: "Premium+" };

export function premiumBadge(p) {
  if (!p) return "";
  const until = p.expires_at ? ` · until ${new Date(p.expires_at).toLocaleDateString()}` : "";
  return `${TIER_LABEL[p.tier] || "Premium"}${until}`;
}

// Admin-only. The server enforces admin access on every call; this only hides the UI.
//  - "Free Premium for everyone": one switch. While on, every account gets Premium and
//    every user is notified (the broadcast popup) the moment it is turned on.
//  - "Grant Premium by email": give one person Premium / Premium+ for a number of days.
export default function PremiumPanel({ users = [], freePremium, prefillEmail = "", prefillTick = 0, onChanged }) {
  const enabled = Boolean(freePremium?.enabled);
  const [switching, setSwitching] = useState(false);
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("premium");
  const [days, setDays] = useState(30);
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const emailRef = useRef(null);

  // "Grant" on a row in the users list fills the email in here.
  useEffect(() => {
    if (!prefillEmail) return;
    setEmail(prefillEmail);
    setError(""); setOk("");
    emailRef.current?.focus();
  }, [prefillEmail, prefillTick]);

  const known = useMemo(() => {
    const e = email.trim().toLowerCase();
    return e ? users.find((u) => String(u.email || "").toLowerCase() === e) : null;
  }, [email, users]);

  const toggle = async () => {
    setError(""); setOk("");
    const next = !enabled;
    const question = next
      ? `Unlock Premium for all ${users.length} users and send them a notification now?`
      : "Turn off free Premium? Users without their own plan go back to the Free plan.";
    if (!window.confirm(question)) return;
    setSwitching(true);
    try {
      const r = await api.premium.setFreeForAll(next);
      setOk(next ? (r.notified ? "Premium is now free for everyone. Every user has been notified." : "Premium is already free for everyone.") : "Free Premium is off.");
      await onChanged?.();
    } catch (e) { setError(e.message || "Could not change the setting."); }
    setSwitching(false);
  };

  const grant = async (e) => {
    e.preventDefault();
    setError(""); setOk("");
    const clean = email.trim().toLowerCase();
    if (!clean) return setError("Enter the user's email.");
    const n = Math.max(1, Math.min(3650, Math.floor(Number(days) || 0)));
    if (!n) return setError("Enter how many days (1-3650).");
    if (!window.confirm(`Give ${clean} ${TIER_LABEL[tier]} for ${n} day${n === 1 ? "" : "s"}?`)) return;
    setGranting(true);
    try {
      const r = await api.premium.grant({ email: clean, tier, days: n });
      setOk(`${r.email} now has ${TIER_LABEL[r.tier]} until ${new Date(r.expires_at).toLocaleDateString()}.`);
      setEmail("");
      await onChanged?.();
    } catch (err) { setError(err.message || "Could not grant Premium."); }
    setGranting(false);
  };

  const field = "w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-white/30";

  return (
    <div id="premium-panel" className="mb-6 rounded-2xl border border-white/10 bg-[#0e0e10]">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <Crown className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-medium text-neutral-200">Premium access</h2>
      </div>

      {/* Free Premium for everyone */}
      <div className="flex items-start gap-4 border-b border-white/10 p-5">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10"><Gift className="h-4 w-4 text-white" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-100">Free Premium for everyone</p>
          <p className="mt-0.5 text-xs leading-5 text-neutral-500">
            While this is on, every account gets Premium features and limits. Turning it on sends every user a notification automatically.
            {enabled && freePremium?.since ? ` On since ${new Date(freePremium.since).toLocaleString()}.` : ""}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Free Premium for everyone"
          disabled={switching}
          onClick={toggle}
          className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition disabled:opacity-60 ${enabled ? "border-emerald-400 bg-emerald-500" : "border-white/20 bg-neutral-700"}`}
        >
          <span className={`absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all ${enabled ? "left-[1.6rem]" : "left-0.5"}`}>
            {switching && <Loader2 className="h-3 w-3 animate-spin text-neutral-700" />}
          </span>
        </button>
      </div>

      {/* Grant by email */}
      <form onSubmit={grant} className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-sky-400" />
          <p className="text-sm font-medium text-neutral-100">Grant Premium by email</p>
        </div>
        <div>
          <input
            ref={emailRef}
            className={field}
            type="email"
            list="premium-user-emails"
            placeholder="user@example.com"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <datalist id="premium-user-emails">
            {users.map((u) => <option key={u.id} value={u.email}>{u.full_name || ""}</option>)}
          </datalist>
          {email.trim() && (
            <p className={`mt-1 text-[11px] ${known ? "text-emerald-400" : "text-neutral-500"}`}>
              {known ? `${known.full_name || "User"}${known.premium ? ` · currently ${premiumBadge(known.premium)}` : " · currently Free"}` : "No account with this email yet. They must sign up first."}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select className={field} value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Plan">
            <option value="premium">Premium</option>
            <option value="premium_plus">Premium+</option>
          </select>
          <div className="relative">
            <input className={`${field} pr-14`} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">days</span>
          </div>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {ok && <p className="text-xs text-emerald-400">{ok}</p>}
        <button
          type="submit"
          disabled={granting || !email.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-40"
        >
          {granting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />} Grant Premium
        </button>
      </form>
    </div>
  );
}

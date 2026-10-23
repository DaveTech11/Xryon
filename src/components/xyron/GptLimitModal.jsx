import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X, Sparkles, Zap, Crown, Check, ArrowLeft } from "lucide-react";

const PLAN_CARDS = [
  {
    id: "premium",
    name: "Premium",
    price: "₦5,000",
    period: "/ month",
    icon: Zap,
    ring: "from-sky-400/30 via-indigo-400/20 to-transparent",
    features: ["500 AI messages/day", "Memory stays on", "50 images/day", "Priority processing"],
  },
  {
    id: "premium_plus",
    name: "Premium+",
    price: "₦10,000",
    period: "/ month",
    icon: Crown,
    ring: "from-amber-300/40 via-fuchsia-400/20 to-transparent",
    popular: true,
    features: ["Unlimited AI messages", "Memory stays on", "200 images/day", "Highest priority"],
  },
];

/**
 * Soft free-tier popup.
 * - Shown once the free daily message quota is used up.
 * - "Continue" just closes it: the user keeps chatting in degraded mode
 *   (fallback endpoint, no memory context) until the quota resets.
 * - "Premium" flips the same card over to show the paid plans.
 */
export default function GptLimitModal({ open, onClose, onContinue = () => {}, modelLabel = "GPT-5.6", lockedModel = null }) {
  const [view, setView] = useState(lockedModel ? "premium" : "notice");

  useEffect(() => {
    if (open) setView(lockedModel ? "premium" : "notice");
  }, [open, lockedModel]);

  if (!open) return null;

  const close = () => { setView("notice"); onClose(); };
  const continueFree = () => { setView("notice"); onContinue(); };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={close}>
      <div className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/15 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
        {view === "notice" ? (
          <>
            <div className="flex items-start justify-between">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <button onClick={close} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <h2 className="mt-5 text-xl font-semibold text-white">Free plan limit reached</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              You've reached the free plan limit for {modelLabel}. Your limit will reset later, but you can
              still keep chatting — memory has been deactivated for this session.
            </p>

            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-neutral-300">
              <Zap className="h-4 w-4 shrink-0" /> Upgrade to keep memory on and get full-speed responses with no daily cap.
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={continueFree} className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/60">
                Continue
              </button>
              <button onClick={() => setView("premium")} className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200">
                Premium
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`flex items-center ${lockedModel ? "justify-end" : "justify-between"}`}>
              {!lockedModel && (
                <button onClick={() => setView("notice")} className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs text-neutral-400 hover:bg-white/10 hover:text-white">
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
              )}
              <button onClick={close} className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <h2 className="mt-4 text-lg font-semibold text-white">{lockedModel ? `${lockedModel} is a Premium model` : "Pick a plan"}</h2>
            <p className="mt-1 text-xs text-neutral-500">{lockedModel ? `Upgrade to unlock ${lockedModel}.` : "Cancel anytime. Limits reset daily."}</p>

            <div className="mt-4 space-y-3">
              {PLAN_CARDS.map((plan) => {
                const Icon = plan.icon;
                return (
                  <div key={plan.id} className={`relative overflow-hidden rounded-2xl border p-4 ${plan.popular ? "border-white/25" : "border-white/10"}`}>
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${plan.ring}`} />
                    {plan.popular && (
                      <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-white px-2 py-0.5 text-[9px] font-bold tracking-wider text-black">
                        MOST POPULAR
                      </div>
                    )}
                    <div className="relative flex items-start gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{plan.name}</span>
                          <span className="whitespace-nowrap text-sm font-semibold text-white">
                            {plan.price}<span className="text-[10px] font-normal text-neutral-400">{plan.period}</span>
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                              <Check className="h-3 w-3 shrink-0 text-white" /> {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Link to="/premium" onClick={close} className="mt-5 block rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-black transition hover:bg-neutral-200">
              View plans & checkout
            </Link>
            <button onClick={lockedModel ? close : continueFree} className="mt-2 w-full rounded-2xl border border-white/10 bg-transparent px-4 py-2.5 text-xs font-medium text-neutral-400 transition hover:text-white">
              {lockedModel ? "Not now" : "Not now, keep using the free plan"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}


import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { api } from "../../../api/client";
import { getTier } from "../../../lib/settings";
import { isAdminUser } from "../../../lib/adminEmails";
import { PLANS } from "../../../lib/plans";
import PaymentMethodModal from "../PaymentMethodModal";

// Plans screen inside Codex: flat dark cards, the plan you are on is highlighted in purple,
// each card has an outlined "Select plan" button and an "Including:" checklist.
// Choosing a paid plan opens the same payment window as the Premium page.
export default function CodexPlans({ open, onClose }) {
  const [tier, setTier] = useState("free");
  const [admin, setAdmin] = useState(false);
  const [payPlan, setPayPlan] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    api.auth.me().then((user) => setAdmin(isAdminUser(user))).catch(() => setAdmin(false));
    getTier().then(setTier).catch(() => {});
    const onKey = (e) => { if (e.key === "Escape" && !payPlan) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, payPlan]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#0a0a0a] text-white" role="dialog" aria-modal="true" aria-label="Codex plans">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <div className="flex items-center justify-between py-3">
            <h1 className="text-xl font-semibold tracking-tight">Plans</h1>
            <button type="button" onClick={onClose} aria-label="Close plans" className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <p className="max-w-xl text-sm text-neutral-400">Codex and the build tools get more room on a higher plan.</p>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => {
              const selected = admin ? plan.id === "premium_plus" : plan.id === tier;
              const isFree = plan.id === "free";
              const locked = isFree && !selected; // you cannot "buy" the free plan
              return (
                <article key={plan.id} className={`flex flex-col border p-6 ${selected ? "border-violet-500/70 bg-[#1d0a3a]" : "border-white/15 bg-[#0d0d0d]"}`}>
                  <h2 className="text-2xl font-semibold tracking-tight">{plan.name}</h2>
                  <p className="mt-2 min-h-[2.75rem] text-[17px] leading-snug text-neutral-300">{plan.description}</p>

                  <p className="mt-8 text-3xl font-semibold tracking-tight">{plan.price}<span className="text-3xl">{isFree ? "" : "/mo"}</span></p>
                  <p className="mt-1 text-[15px] text-neutral-400">{isFree ? "free forever" : "billed monthly"}</p>

                  <button
                    type="button"
                    disabled={selected || locked || admin}
                    onClick={() => setPayPlan(plan)}
                    className={`mt-5 flex h-11 w-full items-center justify-center gap-2 border text-[16px] transition ${selected ? "cursor-default border-white bg-white text-black" : locked || admin ? "cursor-default border-white/20 text-neutral-500" : "border-white/40 text-white hover:bg-white/10 active:scale-[0.99]"}`}
                  >
                    {admin ? (selected ? <>Included with Admin <Check className="h-4 w-4" /></> : "Included with Admin") : selected ? <>Plan selected <Check className="h-4 w-4" /></> : <>Select plan <ArrowRight className="h-4 w-4" /></>}
                  </button>

                  <p className="mt-6 text-[15px] text-neutral-400">Including:</p>
                  <ul className="mt-4 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-3 text-[16px] text-neutral-100">
                        <Check className="h-4 w-4 shrink-0 text-neutral-300" strokeWidth={1.5} /> {f}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </div>
      <PaymentMethodModal open={!!payPlan} plan={payPlan} onClose={() => setPayPlan(null)} />
    </>,
    document.body
  );
}

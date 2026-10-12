import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Crown, Loader2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { api } from "../api/client";
import { getTier } from "../lib/settings";
import { isAdminUser } from "../lib/adminEmails";
import PaymentMethodModal from "../components/xyron/PaymentMethodModal";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "₦0",
    period: "forever",
    description: "A simple way to start with Xyron.",
    features: ["10 AI messages/day", "5 image generations/day", "5 file uploads/day", "5 documentation requests/day"],
    icon: Sparkles,
  },
  {
    id: "premium",
    name: "Premium",
    price: "₦5,000",
    period: "/ month",
    description: "More room for work, images and files.",
    features: ["500 AI messages/day", "50 image generations/day", "100 file uploads/day", "100 documentation requests/day", "Codex & advanced features", "Priority processing"],
    icon: Zap,
  },
  {
    id: "premium_plus",
    name: "Premium+",
    price: "₦10,000",
    period: "/ month",
    description: "Maximum Xyron access for power users.",
    features: ["Unlimited AI messages", "200 image generations/day", "500 file uploads/day", "Unlimited documentation", "Advanced Codex", "Highest priority processing"],
    icon: Crown,
    popular: true,
  },
];

export default function Premium() {
  const [payPlan, setPayPlan] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [tier, setTier] = useState("free");
  // "idle" | "checking" | "paid" | "failed" | "waiting" (still pending after we stopped polling)
  const [payState, setPayState] = useState("idle");
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");

  useEffect(() => {
    api.auth.me().then((user) => setAdmin(isAdminUser(user))).catch(() => setAdmin(false));
    getTier().then(setTier).catch(() => {});
  }, []);

  // Back from the payment page: ask the server (which asks the provider) whether the payment went through.
  useEffect(() => {
    if (!orderId) return;
    // Flutterwave sends status=cancelled when the customer backs out of checkout.
    if (/^cancel/i.test(new URLSearchParams(window.location.search).get("status") || "")) { setPayState("canceled"); return; }
    let stop = false;
    let tries = 0;
    setPayState("checking");
    const tick = async () => {
      if (stop) return;
      try {
        const r = await api.payments.verify(orderId);
        if (stop) return;
        if (r.status === "paid") {
          setPayState("paid");
          getTier().then(setTier).catch(() => {});
          window.history.replaceState({}, "", "/premium?upgrade=success");
          return;
        }
        if (r.status === "failed") { setPayState("failed"); return; }
      } catch { /* try again below */ }
      tries += 1;
      if (tries >= 40) { setPayState("waiting"); return; } // ~2 minutes
      setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; };
  }, [orderId]);

  return (
    <div className="min-h-screen overflow-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,.08),transparent_42%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <header className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-neutral-400 backdrop-blur-xl transition hover:bg-white/[0.08] hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to Xyron</Link>
          <div className="hidden items-center gap-2 text-xs text-neutral-500 sm:flex"><ShieldCheck className="h-4 w-4" /> Secure checkout</div>
        </header>

        {payState === "checking" && <div className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-sm text-neutral-300 backdrop-blur-xl"><Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment…</div>}
        {payState === "paid" && <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-center text-sm text-white backdrop-blur-xl">Payment confirmed. Your subscription is active. <Link to="/" className="underline">Back to chat</Link></div>}
        {payState === "failed" && <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-sm text-neutral-300 backdrop-blur-xl">We couldn't confirm that payment. You have not been charged for a plan. Please try again or choose another method.</div>}
        {payState === "waiting" && <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-sm text-neutral-300 backdrop-blur-xl">Your payment is still being confirmed. This can take a few minutes, especially for crypto. Your plan activates automatically once it is confirmed; refresh this page to check again.</div>}
        {payState === "idle" && params.get("upgrade") === "success" && <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-center text-sm text-white backdrop-blur-xl">Welcome to Xyron Premium. Your subscription is active.</div>}
        {(payState === "canceled" || params.get("upgrade") === "canceled") && <div className="mx-auto mt-6 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center text-sm text-neutral-400 backdrop-blur-xl">Checkout canceled. You can upgrade whenever you're ready.</div>}

        <section className="mx-auto max-w-3xl pt-16 text-center sm:pt-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs text-neutral-300 backdrop-blur-xl"><Sparkles className="h-3.5 w-3.5" /> Simple plans. More power.</div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Choose your <span className="text-neutral-500">Xyron</span> plan.</h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-neutral-500 sm:text-base">Three clean plans with generous limits. Upgrade when you need more.</p>
        </section>

        {admin && <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-center text-sm text-neutral-200 backdrop-blur-xl">Admin access is <strong className="text-white">free</strong>. You never need to purchase Premium.</div>}

        <section className="mt-12 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const current = plan.id === tier;
            const disabled = plan.id === "free" || admin || current;
            return (
              <article key={plan.id} className={`relative flex flex-col overflow-hidden rounded-[2rem] border bg-white/[0.035] p-6 shadow-2xl backdrop-blur-2xl transition hover:-translate-y-1 hover:bg-white/[0.055] ${plan.popular ? "border-white/25" : "border-white/10"}`}>
                {plan.popular && <div className="absolute right-5 top-5 rounded-full border border-white/15 bg-white px-2.5 py-1 text-[10px] font-bold tracking-wider text-black">MOST POPULAR</div>}
                <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/10"><Icon className="h-5 w-5 text-white" /></div>
                <h2 className="mt-6 text-xl font-semibold">{plan.name}</h2>
                <p className="mt-2 min-h-10 text-sm leading-5 text-neutral-500">{plan.description}</p>
                <div className="mt-6 flex items-end gap-1"><span className="text-3xl font-semibold tracking-tight">{plan.price}</span><span className="pb-1 text-xs text-neutral-500">{plan.period}</span></div>
                <div className="my-6 h-px bg-white/10" />
                <ul className="flex-1 space-y-3">
                  {plan.features.map((feature) => <li key={feature} className="flex gap-2.5 text-sm text-neutral-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />{feature}</li>)}
                </ul>
                <button disabled={disabled} onClick={() => setPayPlan(plan)} className={`mt-8 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition ${disabled ? "cursor-default border border-white/10 bg-white/[0.05] text-neutral-500" : plan.popular ? "bg-white text-black hover:bg-neutral-200" : "border border-white/15 bg-black/30 text-white hover:bg-white/10"}`}>
                  {admin ? "Included with Admin access" : plan.id === "free" ? (tier === "free" ? "Current free plan" : "Free plan") : current ? "Current plan" : `Choose ${plan.name}`}
                </button>
              </article>
            );
          })}
        </section>

        <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-neutral-600">Limits are measured per day for Free and Premium. Premium+ removes the AI message and documentation request cap.</p>
      </div>
      <PaymentMethodModal open={!!payPlan} plan={payPlan} onClose={() => setPayPlan(null)} />
    </div>
  );
}

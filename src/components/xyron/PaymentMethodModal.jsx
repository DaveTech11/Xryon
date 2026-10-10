import React, { useEffect, useState } from "react";
import { Bitcoin, CreditCard, Loader2, Smartphone, X } from "lucide-react";
import { api } from "../../api/client";

const METHODS = [
  { id: "flutterwave", name: "Flutterwave", note: "Card, bank transfer, USSD", icon: CreditCard, currency: "ngn" },
  { id: "opay", name: "OPay", note: "OPay wallet, card and bank", icon: Smartphone, currency: "ngn" },
  { id: "crypto", name: "Crypto", note: "USDT, BTC, ETH and more", icon: Bitcoin, currency: "usd" },
];

function price(plan, currency) {
  if (!plan) return "";
  if (currency === "usd") return `$${plan.usd}`;
  return `₦${Number(plan.ngn).toLocaleString("en-NG")}`;
}

// Lets the user choose how to pay, asks the server to create the order with that
// provider, and sends the browser to the provider's hosted checkout.
export default function PaymentMethodModal({ open, plan, onClose }) {
  const [info, setInfo] = useState(null); // { methods, plans }
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(null);
    api.payments.methods().then(setInfo).catch(() => setInfo({ methods: {}, plans: [] }));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape" && !busy) onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open || !plan) return null;

  const serverPlan = info?.plans?.find((p) => p.id === plan.id);

  const pay = async (method) => {
    setError("");
    setBusy(method);
    try {
      const { url } = await api.payments.start({ tier: plan.id, method });
      window.location.href = url;
    } catch (e) {
      setError(e.message || "Could not start the payment. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={() => !busy && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-title"
    >
      <div
        className="relative w-full max-w-md rounded-[2rem] border border-white/15 bg-[#0c0c0d] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={!!busy}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id="pay-title" className="pr-10 text-xl font-semibold text-white">Pay for {plan.name}</h2>
        <p className="mt-1 text-sm text-neutral-500">30 days of access. Choose how you want to pay.</p>

        <div className="mt-5 space-y-2.5">
          {METHODS.map((m) => {
            const Icon = m.icon;
            const available = info ? Boolean(info.methods?.[m.id]) : true;
            const loading = busy === m.id;
            return (
              <button
                key={m.id}
                disabled={!!busy || !available}
                onClick={() => pay(m.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition ${
                  available ? "border-white/12 bg-white/[0.04] hover:bg-white/[0.09]" : "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50"
                } disabled:cursor-not-allowed`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Icon className="h-5 w-5 text-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-white">{m.name}</span>
                  <span className="block truncate text-xs text-neutral-500">{available ? m.note : "Not available yet"}</span>
                </span>
                <span className="text-sm font-semibold text-white">{price(serverPlan || plan, m.currency)}</span>
              </button>
            );
          })}
        </div>

        {error && <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-neutral-300">{error}</div>}

        <p className="mt-5 text-center text-[11px] leading-5 text-neutral-600">
          You&apos;ll be taken to a secure payment page. Your plan activates as soon as the payment is confirmed.
          Crypto payments can take a few minutes to confirm.
        </p>
      </div>
    </div>
  );
}

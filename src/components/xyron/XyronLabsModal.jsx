import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Brain, CornerDownRight, Code2, MessageSquare, Sparkles, WandSparkles, X } from "lucide-react";
import { LABS } from "../../lib/xyronLabs";

const EVENT = "xyron:open-labs";
export const openXyronLabs = () => window.dispatchEvent(new Event(EVENT));

const ICONS = { chat: MessageSquare, studio: WandSparkles, artifacts: Sparkles, brain: Brain, codex: Code2 };
const TILE = {
  chat: "from-sky-500/30 to-blue-700/30",
  studio: "from-fuchsia-500/25 to-indigo-700/30",
  artifacts: "from-amber-400/25 to-orange-700/25",
  brain: "from-emerald-400/25 to-teal-700/30",
  codex: "from-neutral-400/20 to-neutral-700/30",
};

// **bold** -> <strong>
const rich = (s) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <strong key={i} className="font-semibold text-white">{p.slice(2, -2)}</strong> : p));

function Slides() {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const slides = [
    <img key="logo" src="/labs/xyron-logo.jpg" alt="Xyron logo" className="h-full w-full object-cover" />,
    <img key="setup" src="/labs/setup.jpg" alt="Where Xyron is built" className="h-full w-full object-cover" />,
    <div key="word" className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_30%_20%,#1d4ed8_0%,#0a1330_55%,#000_100%)] text-center">
      <span className="text-3xl font-bold tracking-[0.25em] text-white sm:text-4xl">XYRON</span>
      <span className="mt-1 text-sm tracking-[0.5em] text-sky-300">LABS</span>
    </div>,
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-neutral-950">
      <div
        ref={ref}
        onScroll={() => { const el = ref.current; if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth)); }}
        className="flex aspect-[16/10] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => <div key={i} className="h-full w-full shrink-0 snap-center">{s}</div>)}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/40 px-2 py-1.5 backdrop-blur">
        {slides.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/45"}`} />)}
      </div>
    </div>
  );
}

function Avatar({ person }) {
  const [i, setI] = useState(0);
  const base = "grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_35%_25%,#2563eb_0%,#0b1a45_65%,#050814_100%)] ring-1 ring-white/10";
  if (person.photo && i < person.photo.length) {
    return <div className={base}><img src={person.photo[i]} alt={person.name} onError={() => setI(i + 1)} className="h-full w-full object-cover" /></div>;
  }
  return <div className={`${base} text-xl font-bold text-white`}>{person.initials || person.name[0]}</div>;
}

function Section({ title, children }) {
  return (
    <section className="mt-7">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <div className="mt-2 text-[15px] leading-7 text-neutral-300">{children}</div>
    </section>
  );
}

export function XyronLabsModal({ onClose }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const followUp = () => {
    onClose();
    setTimeout(() => document.querySelector("textarea")?.focus(), 80);
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[230] grid place-items-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Xyron Labs"
    >
      <motion.div
        initial={{ y: 24, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 360, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="relative h-[min(90vh,840px)] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl shadow-black/80"
      >
        {/* header that fades in once you scroll, like the reference */}
        <div className={`absolute inset-x-0 top-0 z-10 flex h-14 items-center border-b border-white/10 bg-black/90 px-5 backdrop-blur transition-opacity ${scrolled ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <span className="text-sm font-medium text-white">{LABS.name}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-xl bg-neutral-800/85 text-white backdrop-blur hover:bg-neutral-700">
          <X className="h-5 w-5" />
        </button>

        <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 240)} className="h-full overflow-y-auto pb-24 [scrollbar-width:thin]">
          <div className="p-3 pb-0"><Slides /></div>

          <div className="px-6 pt-5">
            <h2 className="text-2xl font-semibold text-white">{LABS.name}</h2>
            <p className="mt-2 text-[15px] leading-7 text-neutral-300">{LABS.summary}</p>
            <span className="mt-3 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-400">{LABS.status}</span>

            <Section title="What it does"><p>{rich(LABS.whatItDoes)}</p></Section>

            <Section title="Products and services">
              <div className="-mx-6 flex gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {LABS.products.map((p) => {
                  const Icon = ICONS[p.icon] || Sparkles;
                  return (
                    <div key={p.name} className="w-40 shrink-0">
                      <div className={`grid aspect-square place-items-center rounded-2xl bg-gradient-to-br ${TILE[p.icon] || TILE.chat} ring-1 ring-white/10`}>
                        <Icon className="h-10 w-10 text-white/90" />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{p.name}</p>
                      <p className="text-sm text-neutral-500">{p.kind}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Mission and approach"><p>{rich(LABS.mission)}</p></Section>

            <Section title="Quick facts">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {LABS.facts.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm"><dt className="text-neutral-500">{k}:</dt><dd className="text-neutral-200">{v}</dd></div>
                ))}
              </dl>
            </Section>

            <Section title="Developers">
              <div className="space-y-3">
                {LABS.team.map((p) => (
                  <div key={p.heading} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                    <Avatar person={p} />
                    <div className="min-w-0">
                      <p className="bg-gradient-to-r from-sky-300 via-blue-400 to-indigo-400 bg-clip-text text-xl font-bold leading-tight text-transparent">{p.heading}</p>
                      <p className="text-sm font-medium text-white">{p.name}</p>
                      <p className="mt-0.5 text-xs text-neutral-400">{p.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>

        <button type="button" onClick={followUp} className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black shadow-lg shadow-black/50 hover:bg-neutral-200">
          <CornerDownRight className="h-4 w-4" /> Follow up
        </button>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// Mounted once in App; opens when any "Xyron Labs" link is tapped.
export default function XyronLabsHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return open ? <XyronLabsModal onClose={() => setOpen(false)} /> : null;
}

import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Logo from "./xyron/Logo";

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-semibold text-white">{title}</h2>
      <div className="space-y-2 text-sm leading-6 text-neutral-400">{children}</div>
    </section>
  );
}

export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-[#050505] text-neutral-200">
      <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 transition hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Xyron
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-xl font-semibold text-white">{title}</h1>
            {updated && <p className="text-xs text-neutral-500">Last updated {updated}</p>}
          </div>
        </div>

        <div className="mt-8 space-y-6">{children}</div>

        <div className="mt-10 flex items-center gap-2 border-t border-white/10 pt-6 text-xs text-neutral-600">
          <Link to="/privacy" className="transition hover:text-neutral-300">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms" className="transition hover:text-neutral-300">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}

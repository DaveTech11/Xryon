import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, X } from "lucide-react";
import { TEMPLATES, TEMPLATE_CATEGORIES } from "./codexTemplates";

// Template gallery. Every template is a set of real source files. "Use template"
// copies them into your own Codex project; nothing is run.
export default function CodexTemplates({ open, onClose, onUse, busy }) {
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") (selected ? setSelected(null) : onClose()); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selected, onClose]);

  useEffect(() => { if (!open) { setSelected(null); setCategory("All"); } }, [open]);

  const list = useMemo(() => TEMPLATES.filter((t) => category === "All" || t.category === category), [category]);
  if (!open) return null;

  const previewDoc = selected?.preview ? selected.files[0].content : null;

  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Template gallery"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#0a0a0b] text-white shadow-2xl sm:rounded-[2rem]"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          {selected && (
            <button onClick={() => setSelected(null)} aria-label="Back to templates" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-neutral-300 hover:bg-white/5">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-base font-semibold">{selected ? selected.name : "Starter templates"}</h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto grid h-9 w-9 place-items-center rounded-full border border-white/10 text-neutral-300 hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!selected && (
          <>
            <div className="flex gap-2 overflow-x-auto px-5 pt-4">
              {["All", ...TEMPLATE_CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-xs transition ${category === c ? "border-red-500/50 bg-red-500/10 text-white" : "border-white/10 text-neutral-400 hover:text-white"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid gap-3 overflow-y-auto p-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-red-400/40 hover:bg-red-500/5"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-400">{t.category}</span>
                  <span className="mt-1 block text-sm font-semibold">{t.name}</span>
                  <span className="mt-1.5 line-clamp-3 block text-xs leading-relaxed text-neutral-400">{t.description}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {t.tech.map((x) => <span key={x} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">{x}</span>)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {selected && (
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1.3fr_1fr]">
            <div className="min-h-[18rem] overflow-hidden rounded-2xl border border-white/10 bg-black">
              {previewDoc ? (
                // Sandboxed: scripts may run, but the page has no access to Xyron, its cookies or storage.
                <iframe title={`${selected.name} preview`} sandbox="allow-scripts" srcDoc={previewDoc} className="h-full min-h-[22rem] w-full bg-white" />
              ) : (
                <div className="p-5 text-sm text-neutral-400">
                  <p className="font-medium text-white">No browser preview</p>
                  <p className="mt-2 text-xs leading-relaxed">This is a {selected.tech.join(" / ")} project that runs in a terminal, not in a browser. Use the template to copy its files into the editor.</p>
                  <pre className="mt-4 max-h-64 overflow-auto rounded-xl bg-white/5 p-3 text-[11px] leading-relaxed text-neutral-300">{selected.files[0].content.split("\n").slice(0, 18).join("\n")}{"\n…"}</pre>
                </div>
              )}
            </div>

            <div className="space-y-4 text-sm">
              <p className="text-neutral-300">{selected.description}</p>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Technology</h3>
                <p className="mt-1 text-neutral-300">{selected.tech.join(", ")}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Needs</h3>
                <p className="mt-1 text-neutral-300">{selected.deps}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Secrets / environment variables</h3>
                <p className="mt-1 text-neutral-300">{selected.env}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Files</h3>
                <ul className="mt-1 space-y-0.5 text-neutral-300">
                  {selected.files.map((f) => <li key={f.name} className="codex-mono text-xs">{f.name}</li>)}
                </ul>
              </div>
              <button
                onClick={() => onUse(selected)}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-60"
              >
                <Check className="h-4 w-4" /> {busy ? "Adding files…" : "Use this template"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

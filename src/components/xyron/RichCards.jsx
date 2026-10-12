import React, { useEffect, useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { api } from "../../api/client";

// ---- Option cards (thumbnail + title + badge + bullets + link chips + note) ----

const thumbCache = new Map(); // search words -> Promise<thumb url | null>
function loadThumb(query) {
  if (!thumbCache.has(query)) {
    thumbCache.set(query, api.images.search(query, 3)
      .then((r) => r?.images?.[0]?.thumb || null)
      .catch(() => { thumbCache.delete(query); return null; }));
  }
  return thumbCache.get(query);
}

function Thumb({ query }) {
  const [src, setSrc] = useState(undefined); // undefined = loading, null = none
  const [ok, setOk] = useState(true);
  useEffect(() => {
    let live = true;
    if (!query) { setSrc(null); return undefined; }
    loadThumb(query).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [query]);
  if (src === null || !ok) return null;
  return (
    <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#161618] sm:h-36 sm:w-32">
      {src === undefined ? <span className="absolute inset-0 animate-pulse bg-white/[0.06]" aria-hidden="true" /> : (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setOk(false)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}

export function ItemList({ data }) {
  return (
    <div className="my-3 divide-y divide-white/10">
      {data.items.map((it, i) => (
        <div key={`${it.title}-${i}`} className="flex gap-3 py-4 first:pt-1 last:pb-1 sm:gap-4">
          <Thumb query={it.image} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug text-white">{i + 1}. {it.title}</p>
            {it.badge && (
              <span className="mt-1.5 inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 text-[12px] font-medium text-emerald-400">{it.badge}</span>
            )}
            {it.bullets.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-neutral-500">
                {it.bullets.map((b, bi) => <li key={bi} className="leading-relaxed">{b}</li>)}
              </ul>
            )}
            {it.links.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                {it.links.map((l, li) => (
                  <React.Fragment key={l.url}>
                    {li > 0 && <span className="text-neutral-600">·</span>}
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:decoration-sky-400">
                      {l.label}<ArrowUpRight className="h-3 w-3" />
                    </a>
                  </React.Fragment>
                ))}
              </p>
            )}
            {it.note && (() => {
              const m = it.note.match(/^([^:]{2,24}):\s*(.+)$/);
              return <p className="mt-2 leading-relaxed">{m ? <><strong className="font-semibold text-white">{m[1]}:</strong> {m[2]}</> : it.note}</p>;
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Question form (radios / checkboxes + submit) ----

export function AskForm({ data, interactive, onSubmit }) {
  const [answers, setAnswers] = useState(() => Object.fromEntries(data.questions.map((q) => [q.id, q.multi ? [] : [q.options[0]]])));
  const [sent, setSent] = useState(false);
  const locked = !interactive || sent;

  const pick = (q, opt) => {
    if (locked) return;
    setAnswers((cur) => {
      const have = cur[q.id] || [];
      if (!q.multi) return { ...cur, [q.id]: [opt] };
      return { ...cur, [q.id]: have.includes(opt) ? have.filter((x) => x !== opt) : [...have, opt] };
    });
  };
  const ready = data.questions.every((q) => (answers[q.id] || []).length > 0);
  const submit = () => { if (locked || !ready) return; setSent(true); onSubmit?.(answers); };

  return (
    <div className="my-3 max-w-xl rounded-2xl border border-white/10 bg-black/40 p-4 sm:p-5">
      {data.title && <p className="mb-3 font-semibold text-white">{data.title}</p>}
      {data.questions.map((q, qi) => (
        <fieldset key={q.id} className={qi > 0 ? "mt-4 border-t border-white/10 pt-4" : ""} disabled={locked}>
          <legend className="mb-2.5 font-semibold text-white">{q.question}</legend>
          <div role={q.multi ? "group" : "radiogroup"} className="space-y-1">
            {q.options.map((opt) => {
              const on = (answers[q.id] || []).includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  role={q.multi ? "checkbox" : "radio"}
                  aria-checked={on}
                  onClick={() => pick(q, opt)}
                  className={`flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition ${locked ? "cursor-default" : "hover:bg-white/[0.05]"} ${on ? "text-white" : "text-neutral-300"}`}
                >
                  <span className={`grid h-5 w-5 shrink-0 place-items-center border ${q.multi ? "rounded-md" : "rounded-full"} ${on ? "border-white bg-white text-black" : "border-neutral-500"}`}>
                    {on && (q.multi ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <span className="h-2 w-2 rounded-full bg-black" />)}
                  </span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {interactive && (
        <button
          type="button"
          onClick={submit}
          disabled={locked || !ready}
          className="mt-5 w-full rounded-full bg-neutral-100 px-4 py-2.5 font-medium text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sent ? "Sent" : data.submit}
        </button>
      )}
    </div>
  );
}

// ---- Inline source pill: [Name](https://url "pill") ----

export function SourcePill({ href, children }) {
  let host = "";
  try { host = new URL(href).hostname; } catch { /* no favicon */ }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mx-0.5 inline-flex max-w-[11rem] items-center gap-1.5 whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 align-middle text-[12px] font-medium text-neutral-200 no-underline transition hover:bg-white/20">
      {host && <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" width="14" height="14" className="h-3.5 w-3.5 rounded-sm" loading="lazy" />}
      <span className="truncate">{children}</span>
    </a>
  );
}

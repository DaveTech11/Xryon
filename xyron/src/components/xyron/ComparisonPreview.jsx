import React from "react";
import { ExternalLink } from "lucide-react";

const Skeleton = () => (
  <div className="grid max-w-3xl animate-pulse grid-cols-2 gap-3">
    {[0, 1].map((i) => (
      <div key={i} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-3 sm:p-4">
        <div className="h-32 w-full rounded-xl bg-white/[0.07] sm:h-40" />
        <div className="mt-3 h-4 w-2/3 rounded bg-white/10" />
        <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.07]" />
      </div>
    ))}
  </div>
);

function Side({ preview, fallbackName }) {
  if (!preview) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center sm:p-5">
        <p className="text-sm font-medium text-neutral-300">{fallbackName}</p>
        <p className="mt-1 text-xs text-neutral-600">No reliable source found</p>
      </div>
    );
  }
  const img = preview.images?.[0];
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] p-3 sm:p-4">
      {img && (
        <div className="overflow-hidden rounded-xl bg-black/40">
          <img src={img.src} alt="" loading="lazy" className="h-32 w-full object-contain sm:h-40" />
        </div>
      )}
      <div className="mt-3 flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-tight text-white sm:text-base">{preview.title}</h4>
        {preview.badge && <span className="shrink-0 text-base" title={preview.badge.label} aria-hidden>{preview.badge.icon}</span>}
      </div>
      {preview.subtitle && <p className="mt-0.5 text-[11px] first-letter:uppercase text-neutral-500">{preview.subtitle}</p>}
      {preview.facts?.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-neutral-300">
          {preview.facts.slice(0, 4).map((f) => (
            <li key={f.label} className="flex justify-between gap-2">
              <span className="text-neutral-500">{f.label}</span>
              <span className="truncate text-right">{f.value}</span>
            </li>
          ))}
        </ul>
      )}
      {preview.url && (
        <a href={preview.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1 text-[10px] text-neutral-600 hover:text-neutral-300">
          Wikipedia <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </div>
  );
}

export default function ComparisonPreview({ comparison }) {
  if (!comparison || comparison.status === "loading") return <Skeleton />;
  return (
    <div className="max-w-3xl">
      <div className="relative grid grid-cols-2 gap-3">
        <Side preview={comparison.a} fallbackName={comparison.aQuery} />
        <Side preview={comparison.b} fallbackName={comparison.bQuery} />
        <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[#050505] text-[10px] font-semibold text-neutral-400">
          VS
        </span>
      </div>
    </div>
  );
}


import React, { useState } from "react";
import { Globe } from "lucide-react";

// Under an answer that used Web search: the articles it relied on, as cards.
// The headline is the link (underlined words), the picture is the article's own picture when it has one.

function shortDate(raw = "") {
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return String(raw).slice(0, 24);
}

function SourceCard({ item }) {
  const [broken, setBroken] = useState(false);
  const showImage = item.image && !broken;
  return (
    <div className="flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1b1b1d] sm:w-52">
      {showImage && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="block aspect-[16/10] w-full overflow-hidden bg-white/[0.04]">
          <img src={item.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        </a>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="line-clamp-3 text-[13px] font-medium leading-snug text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:decoration-sky-400">
          {item.title}
        </a>
        <p className="mt-auto truncate text-[11px] text-neutral-500">
          {[item.source, item.date && shortDate(item.date)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );
}

export default function WebSources({ sources = [] }) {
  const items = (Array.isArray(sources) ? sources : []).filter((s) => s?.title && /^https?:\/\//i.test(s.url || ""));
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-neutral-400"><Globe className="h-3.5 w-3.5" /> Sources</p>
      <div className="xyron-chip-row -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {items.map((item) => <SourceCard key={item.url} item={item} />)}
      </div>
    </div>
  );
}

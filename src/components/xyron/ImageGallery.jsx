import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, ExternalLink, ImageOff, Images, RotateCw, X } from "lucide-react";

// Photo gallery shown directly under an AI reply (wallpapers, fashion, places, products...).
// States: loading (shimmering tiles) -> ready (responsive grid, lazy images, captions, source
// links, tap for a large viewer) -> error (friendly message + Retry). Pictures that fail to
// load drop out of the grid on their own.

function Tile({ item, featured, onOpen, onBroken }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      aria-label={`Open image: ${item.caption || "photo"}`}
      className={`xgal-tile group relative cursor-zoom-in overflow-hidden rounded-xl border border-white/10 bg-[#161618] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${featured ? "col-span-2 row-span-2" : ""}`}
    >
      {!loaded && <span className="xgal-shimmer absolute inset-0" aria-hidden="true" />}
      <img
        src={item.thumb}
        alt={item.caption || "Related photo"}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={onBroken}
        className={`h-full w-full object-cover transition duration-500 group-hover:scale-[1.04] ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-6">
        {item.caption && <p className={`truncate text-white ${featured ? "text-xs sm:text-sm" : "text-[11px]"}`}>{item.caption}</p>}
      </div>
      {item.link && (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Source: ${item.source}`}
          className="absolute right-1.5 top-1.5 flex max-w-[85%] items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur transition hover:bg-black/80"
        >
          <span className="truncate">{item.source}</span><ExternalLink className="h-2.5 w-2.5 shrink-0" />
        </a>
      )}
    </div>
  );
}

function Lightbox({ items, index, onClose }) {
  const [i, setI] = useState(index);
  const [ready, setReady] = useState(false);
  const touch = useRef(null);
  const count = items.length;
  const item = items[i];

  const go = useCallback((d) => { setReady(false); setI((cur) => (cur + d + count) % count); }, [count]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  if (!item) return null;
  const btn = "grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-95";

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null || count < 2) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs text-neutral-400">{i + 1} / {count}</span>
        <div className="flex items-center gap-2">
          <a href={item.full} download={`xyron-${item.id || "image"}.jpg`} className={btn} aria-label="Download image" title="Download"><Download className="h-4 w-4" /></a>
          {item.link && <a href={item.link} target="_blank" rel="noreferrer noopener" className={btn} aria-label="Open source page" title="Open source"><ExternalLink className="h-4 w-4" /></a>}
          <button type="button" onClick={onClose} className={btn} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14">
        {!ready && <span className="xgal-spinner absolute" aria-hidden="true" />}
        <img
          key={item.full}
          src={item.full}
          alt={item.caption || "Photo"}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
          onClick={(e) => e.stopPropagation()}
          className={`max-h-full max-w-full select-none rounded-lg object-contain transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
          draggable={false}
        />
        {count > 1 && (
          <>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }} className={`${btn} absolute left-2 hidden sm:grid`} aria-label="Previous image"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }} className={`${btn} absolute right-2 hidden sm:grid`} aria-label="Next image"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
      </div>

      <div className="xyron-safe-bottom px-4 pb-4 pt-3 text-center" onClick={(e) => e.stopPropagation()}>
        {item.caption && <p className="mx-auto max-w-2xl text-sm text-white">{item.caption}</p>}
        <p className="mt-1 text-xs text-neutral-400">
          {item.credit ? `Photo by ${item.credit} · ` : ""}
          {item.link ? <a href={item.link} target="_blank" rel="noreferrer noopener" className="underline hover:text-white">{item.source}</a> : item.source}
        </p>
      </div>
    </div>,
    document.body
  );
}

export default function ImageGallery({ images, onRetry }) {
  const [open, setOpen] = useState(null);
  const [broken, setBroken] = useState(() => new Set());
  if (!images) return null;

  const { status = "ready", query = "", items = [] } = images;
  const shown = items.filter((x) => !broken.has(x.id));
  const label = (
    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
      <Images className="h-3.5 w-3.5" /> Images{query ? <span className="truncate normal-case tracking-normal text-neutral-600">· {query}</span> : null}
    </div>
  );

  let body;
  if (status === "loading") {
    body = (
      <div className="xgal-grid grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true" aria-label="Loading images">
        {Array.from({ length: 5 }).map((_, n) => (
          <div key={n} className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#161618] ${n === 0 ? "col-span-2 row-span-2" : ""}`}><span className="xgal-shimmer absolute inset-0" /></div>
        ))}
      </div>
    );
  } else if (status === "error" || (status === "ready" && items.length > 0 && shown.length === 0)) {
    body = (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-neutral-400">
        <ImageOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">Couldn&apos;t load pictures for this right now.</span>
        {onRetry && <button type="button" onClick={() => { setBroken(new Set()); onRetry(); }} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 font-medium text-white transition hover:bg-white/20 active:scale-95"><RotateCw className="h-3 w-3" /> Retry</button>}
      </div>
    );
  } else if (!shown.length) {
    return null;
  } else {
    body = (
      <div className="xgal-grid grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((item, n) => (
          <Tile
            key={item.id}
            item={item}
            featured={n === 0 && shown.length >= 3}
            onOpen={() => setOpen(n)}
            onBroken={() => setBroken((cur) => new Set(cur).add(item.id))}
          />
        ))}
      </div>
    );
  }

  return (
    <section className="mt-3" aria-label="Related images">
      {label}
      {body}
      {open !== null && shown[open] && <Lightbox items={shown} index={open} onClose={() => setOpen(null)} />}
      <style>{`
        .xgal-grid { grid-auto-rows: 6.5rem; }
        @media (min-width: 640px) { .xgal-grid { grid-auto-rows: 8.5rem; } }
        .xgal-shimmer { background: linear-gradient(110deg, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.03) 70%); background-size: 220% 100%; animation: xgal-shimmer 1.4s linear infinite; }
        @keyframes xgal-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
        .xgal-spinner { width: 28px; height: 28px; border-radius: 9999px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; animation: xgal-spin 0.8s linear infinite; }
        @keyframes xgal-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .xgal-shimmer, .xgal-spinner { animation: none; } .xgal-tile img { transition: none; } }
      `}</style>
    </section>
  );
}

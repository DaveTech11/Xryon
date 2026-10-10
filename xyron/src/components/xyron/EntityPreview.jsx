import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

const Skeleton = () => (
  <div className="max-w-3xl animate-pulse overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
    <div className="h-6 w-1/2 rounded-lg bg-white/10" />
    <div className="mt-2 h-3 w-1/3 rounded bg-white/[0.07]" />
    <div className="mt-4 space-y-2"><div className="h-3 w-full rounded bg-white/[0.07]" /><div className="h-3 w-11/12 rounded bg-white/[0.07]" /><div className="h-3 w-2/3 rounded bg-white/[0.07]" /></div>
    <div className="mt-4 h-56 w-full rounded-2xl bg-white/[0.07] sm:h-72" />
    <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="h-3 rounded bg-white/[0.07]" /><div className="h-3 rounded bg-white/[0.07]" /><div className="h-3 rounded bg-white/[0.07]" /></div>
  </div>
);

function Lightbox({ images, index, onIndex, onClose }) {
  const touch = useRef(null);
  const n = images.length;
  const go = useCallback((d) => onIndex((index + d + n) % n), [index, n, onIndex]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") go(-1); if (e.key === "ArrowRight") go(1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);
  const img = images[index];
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm" onClick={onClose}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current == null || n < 2) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touch.current = null; }}>
      <div className="flex items-center justify-between px-4 py-3 text-xs text-neutral-400">
        <span>{index + 1} / {n}</span>
        <div className="flex items-center gap-4">
          {img.page && <a href={img.page} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-white">Image source <ExternalLink className="h-3 w-3" /></a>}
          <button onClick={onClose} aria-label="Close" className="text-neutral-300 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-2 pb-6">
        <img src={img.full} alt="" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-xl object-contain" />
        {n > 1 && <>
          <button onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous" className="absolute left-3 hidden h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"><ChevronLeft className="h-5 w-5" /></button>
          <button onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next" className="absolute right-3 hidden h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:grid"><ChevronRight className="h-5 w-5" /></button>
        </>}
      </div>
    </div>
  );
}

function Carousel({ images }) {
  const scroller = useRef(null);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState({});
  const [open, setOpen] = useState(false);
  const n = images.length;

  const onScroll = () => {
    const el = scroller.current;
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goTo = (i) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="mt-4">
      <div className="group relative overflow-hidden rounded-2xl bg-black/40">
        <div ref={scroller} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((im, i) => (
            <button key={im.src} type="button" onClick={() => setOpen(true)} aria-label="Open larger image" className="relative h-56 w-full shrink-0 snap-center cursor-zoom-in sm:h-72">
              {!loaded[i] && <div className="absolute inset-0 animate-pulse bg-white/[0.07]" />}
              <img src={im.src} alt="" loading={i === 0 ? "eager" : "lazy"} onLoad={() => setLoaded((l) => ({ ...l, [i]: true }))}
                className={`h-full w-full object-contain transition-opacity duration-300 ${loaded[i] ? "opacity-100" : "opacity-0"}`} />
            </button>
          ))}
        </div>
        {n > 1 && <>
          <button type="button" onClick={() => goTo(Math.max(0, idx - 1))} aria-label="Previous image" className="absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 sm:grid"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => goTo(Math.min(n - 1, idx + 1))} aria-label="Next image" className="absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 sm:grid"><ChevronRight className="h-4 w-4" /></button>
          <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/50 px-2 py-1">
            {images.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />)}
          </div>
        </>}
      </div>
      {images[idx]?.page && (
        <a href={images[idx].page} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-neutral-600 hover:text-neutral-300">
          Image: Wikimedia <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
      {open && <Lightbox images={images} index={idx} onIndex={(i) => { setIdx(i); goTo(i); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

export default function EntityPreview({ preview }) {
  const [images, setImages] = useState(preview?.images || []);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setImages(preview?.images || []); setExpanded(false); }, [preview]);
  if (!preview || preview.status === "loading") return <Skeleton />;

  const factsShown = expanded ? preview.facts : (preview.facts || []).slice(0, 4);
  const canExpand = !!preview.fullDescription || (preview.facts?.length || 0) > 4;

  return (
    <article className="max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold leading-tight text-white">{preview.title}</h3>
        {preview.badge && (
          <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300">
            <span aria-hidden>{preview.badge.icon}</span> {preview.badge.label}
          </span>
        )}
      </div>
      {preview.subtitle && <p className="mt-0.5 text-xs first-letter:uppercase text-neutral-500">{preview.subtitle}</p>}
      <p className="mt-3 text-sm leading-relaxed text-neutral-300">{expanded && preview.fullDescription ? preview.fullDescription : preview.description}</p>
      {images.length > 0 && (
        <ImageBoundary images={images} onBroken={(src) => setImages((cur) => cur.filter((i) => i.src !== src))} />
      )}
      {factsShown?.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-neutral-600">Quick facts</p>
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {factsShown.map((f) => (
              <li key={f.label} className="flex gap-2 text-neutral-300"><span className="text-neutral-600">•</span><span><span className="text-neutral-500">{f.label}:</span> {f.value}</span></li>
            ))}
          </ul>
        </div>
      )}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-white"
        >
          {expanded ? "Less" : "More details"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
      {preview.sources?.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 text-[11px] text-neutral-500">
          <span>Sources</span>
          {preview.sources.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-neutral-300 hover:bg-white/10 hover:text-white">
              {s.label} <ExternalLink className="h-3 w-3" />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

// Drops images that fail to load so a broken image never shows.
function ImageBoundary({ images, onBroken }) {
  return (
    <>
      <div className="hidden">{images.map((i) => <img key={i.src} src={i.src} alt="" onError={() => onBroken(i.src)} />)}</div>
      <Carousel images={images} />
    </>
  );
}


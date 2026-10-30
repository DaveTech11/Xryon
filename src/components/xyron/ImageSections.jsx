import React, { useEffect, useState } from "react";
import { Lightbox } from "./ImageGallery";
import { api } from "../../api/client";

// ChatGPT-style image rows inside an answer (:::xyron-images blocks, see lib/richBlocks.js).
// Each item = one picture found with its own search words + a title and caption underneath.
// layout "cards": large pictures side by side. layout "list": small picture beside the text.
// Tap a picture to open the big viewer. A picture that can't load simply drops out.

const cache = new Map(); // search words -> Promise<image item | null>
function loadImage(query) {
  if (!cache.has(query)) {
    cache.set(query, api.images.search(query, 6)
      .then((r) => (Array.isArray(r?.images) ? r.images.filter((x) => x?.thumb) : []))
      .catch(() => { cache.delete(query); return null; }));
  }
  return cache.get(query);
}

function Pic({ img, caption, ratio, onOpen }) {
  const [ok, setOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  if (img === null || !ok) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!img}
      aria-label={`Open image: ${caption || "picture"}`}
      className={`relative block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-white/10 bg-[#161618] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${ratio}`}
    >
      {(!img || !loaded) && <span className="xgal-shimmer absolute inset-0" aria-hidden="true" />}
      {img && (
        <img
          src={img.thumb}
          alt={caption || "Related picture"}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setOk(false)}
          className={`h-full w-full object-cover object-top transition duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </button>
  );
}

export default function ImageSections({ data }) {
  const items = data?.items || [];
  const list = data?.layout === "list";
  const [found, setFound] = useState(() => items.map(() => undefined)); // undefined = loading, null = none
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let live = true;
    // Every picture in the answer is a different one: each item takes the first result no earlier item took.
    Promise.all(items.map((it) => loadImage(it.query))).then((all) => {
      if (!live) return;
      const used = new Set();
      setFound(all.map((list) => { const pick = (list || []).find((x) => !used.has(x.id) && !used.has(x.thumb)) || null; if (pick) { used.add(pick.id); used.add(pick.thumb); } return pick; }));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items)]);

  const viewer = items.map((it, i) => (found[i] ? { ...found[i], caption: [it.title, it.caption].filter(Boolean).join(" - ") } : null)).filter(Boolean);
  const openAt = (i) => { const at = viewer.findIndex((v) => v.id === found[i]?.id); if (at >= 0) setOpen(at); };

  const lightbox = open !== null && viewer[open] ? <Lightbox items={viewer} index={open} onClose={() => setOpen(null)} /> : null;

  if (list) {
    return (
      <div className="my-3 space-y-4">
        {items.map((it, i) => (
          <div key={`${it.query}-${i}`} className="flex items-start gap-3 sm:gap-4">
            {found[i] !== null && <div className="w-28 shrink-0 sm:w-36"><Pic img={found[i]} caption={it.title} ratio="aspect-[4/3]" onOpen={() => openAt(i)} /></div>}
            <div className="min-w-0 flex-1">
              {it.title && <p className="font-semibold leading-snug text-white">{it.title}</p>}
              {it.caption && <p className="mt-1 leading-relaxed text-neutral-300">{it.caption}</p>}
            </div>
          </div>
        ))}
        {lightbox}
      </div>
    );
  }

  const cols = items.length >= 3 ? "sm:grid-cols-3" : items.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-1 sm:max-w-sm";
  return (
    <div className={`my-3 flex snap-x gap-3 overflow-x-auto pb-1 sm:grid sm:overflow-visible ${cols}`}>
      {items.map((it, i) => (
        <figure key={`${it.query}-${i}`} className="m-0 w-[72%] shrink-0 snap-start sm:w-auto">
          {found[i] !== null && <Pic img={found[i]} caption={it.title} ratio="aspect-[4/5]" onOpen={() => openAt(i)} />}
          <figcaption className={found[i] !== null ? "mt-2" : ""}>
            {it.title && <p className="font-semibold leading-snug text-white">{it.title}</p>}
            {it.caption && <p className="mt-0.5 leading-snug text-neutral-300">{it.caption}</p>}
          </figcaption>
        </figure>
      ))}
      {lightbox}
    </div>
  );
}

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, ChevronLeft, ChevronRight, Download, ExternalLink, Link2, Loader2, MoreHorizontal, Share2, X } from "lucide-react";

// Full-screen image viewer (opened by tapping an uploaded image in the chat).
// Desktop: title bar on top, big image, thumbnail rail on the left.
// Mobile: same bar, image fills the screen, thumbnails sit along the bottom.

const extFromBlob = (blob) => {
  const t = (blob?.type || "").split("/")[1] || "png";
  return t.split("+")[0].replace("jpeg", "jpg");
};

async function toBlob(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load image");
  return res.blob();
}

export async function downloadImage(url, baseName = "xyron-image") {
  let href = url;
  let revoke = null;
  let name = baseName;
  try {
    const blob = await toBlob(url);
    href = URL.createObjectURL(blob);
    revoke = href;
    name = `${baseName}.${extFromBlob(blob)}`;
  } catch {
    /* fall back to a direct link */
  }
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(revoke), 4000);
}

// `onEdit(prompt, url, index)` (optional) adds a "Describe edits" bar under the image.
// It may return a promise; the bar shows a spinner until it settles and shows any thrown message.
export default function ImageViewer({ images = [], index = 0, onClose, title = "Uploaded image", onEdit, editPlaceholder = "Describe edits" }) {
  const [editText, setEditText] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [current, setCurrent] = useState(index);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState("");
  const noteTimer = useRef(null);
  const touch = useRef(null);
  const count = images.length;
  const url = images[current];

  const flash = (msg) => {
    setNote(msg);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 1800);
  };

  const go = useCallback((d) => setCurrent((c) => (count ? (c + d + count) % count : 0)), [count]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight" && count > 1) go(1);
      else if (e.key === "ArrowLeft" && count > 1) go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(noteTimer.current);
    };
  }, [go, count, onClose]);

  const absolute = (u) => {
    try { return new URL(u, window.location.href).href; } catch { return u; }
  };

  const share = async () => {
    setMenu(false);
    try {
      const blob = await toBlob(url);
      const file = new File([blob], `xyron-image.${extFromBlob(blob)}`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    try {
      if (navigator.share && !url.startsWith("data:")) { await navigator.share({ title, url: absolute(url) }); return; }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    copyLink();
  };

  const copyLink = async () => {
    setMenu(false);
    if (url.startsWith("data:")) { flash("Use Download to save this image"); return; }
    try { await navigator.clipboard.writeText(absolute(url)); flash("Link copied"); }
    catch { flash("Couldn't copy link"); }
  };

  const onTouchStart = (e) => { touch.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touch.current == null || count < 2) return;
    const dx = e.changedTouches[0].clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  };

  const submitEdit = async () => {
    const prompt = editText.trim();
    if (!prompt || editBusy || !onEdit) return;
    setEditBusy(true); setEditError("");
    try { await onEdit(prompt, url, current); }
    catch (e) { setEditError(e?.message || "Couldn't start the edit. Please try again."); setEditBusy(false); }
  };

  if (!url) return null;

  const iconBtn = "grid h-10 w-10 shrink-0 place-items-center rounded-full text-white/90 transition hover:bg-white/10 active:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#171717] text-white" role="dialog" aria-modal="true" aria-label={title}>
      {/* top bar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/5 bg-black px-2 sm:px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button type="button" onClick={onClose} className={iconBtn} aria-label="Close"><X className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1 truncate px-1 text-sm font-medium sm:text-base">{title}{count > 1 ? ` (${current + 1}/${count})` : ""}</div>
        <button type="button" onClick={share} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black transition hover:bg-white/90 active:scale-95">
          <Share2 className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">Share</span>
        </button>
        <button type="button" onClick={() => downloadImage(url)} className={iconBtn} aria-label="Download"><Download className="h-5 w-5" /></button>
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} className={iconBtn} aria-label="More options" aria-expanded={menu}><MoreHorizontal className="h-5 w-5" /></button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#262626] py-1 shadow-xl">
                <a href={url} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-white/10"><ExternalLink className="h-4 w-4" />Open in new tab</a>
                <button type="button" onClick={copyLink} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-white/10"><Link2 className="h-4 w-4" />Copy link</button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* body: thumbnails rail (desktop) / strip (mobile) + stage */}
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        {count > 1 && (
          <div className="order-last flex shrink-0 gap-2 overflow-x-auto border-t border-white/5 p-3 md:order-first md:w-[104px] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:border-r md:border-t-0" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
            {images.map((src, i) => (
              <button
                key={`${i}-${src.slice(-24)}`}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Image ${i + 1}`}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition md:h-[84px] md:w-[84px] ${i === current ? "border-white" : "border-transparent opacity-60 hover:opacity-100"}`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        )}

        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-3 sm:p-6" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
          <img
            key={url}
            src={url}
            alt="Uploaded"
            draggable={false}
            className="max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl shadow-black/60"
          />
          {count > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous image" className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 sm:grid"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => go(1)} aria-label="Next image" className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 sm:grid"><ChevronRight className="h-5 w-5" /></button>
            </>
          )}
          {note && <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-medium text-black shadow-lg">{note}</div>}
        </div>
      </div>

      {onEdit && (
        <div className="shrink-0 border-t border-white/5 bg-[#171717] px-3 pt-3 sm:px-6" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto w-full max-w-2xl">
            {editError && <p className="mb-2 px-2 text-xs text-red-400">{editError}</p>}
            <div className="flex items-center gap-2 rounded-3xl border border-white/10 bg-[#262626] py-2 pl-5 pr-2">
              <input
                value={editText}
                onChange={(e) => { setEditText(e.target.value); if (editError) setEditError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitEdit(); } }}
                disabled={editBusy}
                maxLength={500}
                placeholder={editPlaceholder}
                aria-label={editPlaceholder}
                className="min-w-0 flex-1 bg-transparent py-2 text-base text-white outline-none placeholder:text-neutral-500"
              />
              <button
                type="button"
                onClick={submitEdit}
                disabled={!editText.trim() || editBusy}
                aria-label="Send edit to chat"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black transition hover:bg-neutral-200 disabled:bg-white/15 disabled:text-white/40"
              >
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

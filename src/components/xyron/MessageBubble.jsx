import React, { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Paperclip, Pencil } from "lucide-react";
import { getSetting } from "../../lib/settings";
import EntityPreview from "./EntityPreview";
import ComparisonPreview from "./ComparisonPreview";
import MessageActions from "./MessageActions";
import MessageContent from "./MessageContent";
import ImageViewer from "./ImageViewer";
import ImageGallery from "./ImageGallery";
import { usePrefersReducedMotion } from "./ImageForge";
import FileAttachmentCard from "./FileAttachmentCard";
import { attachmentsOf } from "../../lib/fileKinds";
import GameCenter, { detectGameIntent } from "./GameCenter";

const FONT_SIZE_CLASS = { sm: "text-xs", md: "text-sm", lg: "text-base" };

// A freshly generated image is revealed progressively on the client: a soft
// top-to-bottom wipe, going from a grayscale "sketch" look to colour and then
// to full sharpness, with a small pencil following the edge. The provider only
// returns a finished image, so this is a visual effect on that image - it does
// not claim the AI drew it stroke by stroke. Images loaded from history (or
// already revealed once) render immediately with no animation.
const revealedUrls = new Set();
const REVEAL_MS = 2600;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const FROM_STYLE = { clipPath: "inset(0 0 100% 0)", filter: "grayscale(1) contrast(1.4) blur(6px)" };

function GeneratedImage({ url, fresh = false }) {
  const reduced = usePrefersReducedMotion();
  const animate = fresh && !reduced && !revealedUrls.has(url);
  const [done, setDone] = useState(!animate);
  const imgRef = useRef(null);
  const penRef = useRef(null);
  const edgeRef = useRef(null);

  useEffect(() => {
    if (!animate) return undefined;
    revealedUrls.add(url);
    const img = imgRef.current;
    // If the picture is still downloading, skip the reveal and just show it (the browser paints it as it loads).
    if (!img || !img.complete || !img.naturalWidth) { setDone(true); return undefined; }
    let raf = 0;
    let start = 0;
    const apply = (t) => {
      const wipe = smooth(0, 0.7, t);
      const color = smooth(0.35, 0.85, t);
      const sharp = smooth(0.5, 1, t);
      img.style.clipPath = `inset(0 0 ${((1 - wipe) * 100).toFixed(2)}% 0)`;
      img.style.filter = `grayscale(${(1 - color).toFixed(3)}) contrast(${(1 + 0.4 * (1 - color)).toFixed(3)}) blur(${(6 * (1 - sharp)).toFixed(2)}px)`;
      const pen = penRef.current;
      const edge = edgeRef.current;
      const show = t < 0.72;
      if (pen) {
        pen.style.opacity = show ? "1" : "0";
        pen.style.top = `${(wipe * 100).toFixed(2)}%`;
        pen.style.left = `${(50 + 38 * Math.sin(t * 18)).toFixed(2)}%`;
      }
      if (edge) {
        edge.style.opacity = show ? "1" : "0";
        edge.style.top = `${(wipe * 100).toFixed(2)}%`;
      }
    };
    const frame = (now) => {
      if (!start) start = now;
      const t = clamp01((now - start) / REVEAL_MS);
      apply(t);
      if (t < 1) raf = requestAnimationFrame(frame);
      else setDone(true);
    };
    apply(0);
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [animate, url]);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-black/10 bg-black/5">
      <img
        ref={imgRef}
        src={url}
        alt="Generated"
        className={`block h-auto max-h-[32rem] w-full object-contain ${reduced && fresh ? "xyron-img-fade" : ""}`}
        style={done ? undefined : FROM_STYLE}
      />
      {!done && (
        <>
          <span ref={edgeRef} aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" style={{ top: 0, opacity: 0 }} />
          <Pencil ref={penRef} aria-hidden strokeWidth={1.75} className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-full text-white/90 drop-shadow" style={{ top: 0, left: "50%", opacity: 0 }} />
        </>
      )}
      <div className={`absolute bottom-2 right-2 flex gap-1.5 transition-opacity duration-500 ${done ? "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" : "opacity-0"}`}>
        <a href={url} download target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80" aria-label="Download image"><Download className="h-3.5 w-3.5" /></a>
        <a href={url} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80" aria-label="Open image"><ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <style>{`
        .xyron-img-fade { animation: xyron-img-fade 0.25s ease-out; }
        @keyframes xyron-img-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

// What the user attached to their own message: images show as tappable
// previews (tap → full-screen viewer); anything the browser can't draw as an
// image falls back to a small "Attached file" chip.
function UserAttachments({ urls }) {
  const [failed, setFailed] = useState(() => new Set());
  const [open, setOpen] = useState(null);
  const images = urls.map((u, i) => ({ u, i })).filter(({ u, i }) => !failed.has(i) && !/\.(pdf|docx?|xlsx?|pptx?|zip|txt|csv|json)(\?|$)/i.test(String(u)));
  const viewerUrls = images.map(({ u }) => u);
  const single = urls.length === 1;
  return (
    <>
      <div className={`mt-3 grid gap-2 ${single ? "grid-cols-1" : "grid-cols-2"}`}>
        {urls.map((url, index) => {
          const pos = images.findIndex((x) => x.i === index);
          if (pos === -1) {
            return (
              <a key={`${url}-${index}`} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 overflow-hidden rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-xs">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />Attached file {index + 1}
              </a>
            );
          }
          return (
            <button
              key={`${url}-${index}`}
              type="button"
              onClick={() => setOpen(pos)}
              aria-label="Open image"
              className={`group relative block overflow-hidden rounded-xl border border-black/10 bg-black/5 ${single ? "max-w-[18rem] sm:max-w-sm" : ""}`}
            >
              <img
                src={url}
                alt="Uploaded"
                loading="lazy"
                onError={() => setFailed((f) => new Set(f).add(index))}
                className={`w-full object-cover transition group-hover:brightness-90 ${single ? "max-h-72" : "aspect-square"}`}
              />
            </button>
          );
        })}
      </div>
      {open !== null && <ImageViewer images={viewerUrls} index={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export default function MessageBubble({
  role,
  content,
  file_urls = [],
  file_meta = null,
  preview = null,
  comparison = null,
  images = null,
  fresh = false,
  zipSource = null,
  onRetryImages,
  local = false,
  isLast = false,
  onRegenerate,
  regenerateDisabled = false,
  onSend = null,
}) {
  if (preview) return <EntityPreview preview={preview} />;
  if (comparison) return <ComparisonPreview comparison={comparison} />;
  const sizeClass = FONT_SIZE_CLASS[getSetting("fontSize", "md")] || "text-sm";
  const isAssistant = role === "assistant";
  const hasContent = !!(content?.trim() || file_urls?.length > 0);
  const gameIntent = content?.trim() ? detectGameIntent(content) : null;

  // The person's own attachments: documents/ZIPs/code show as file cards, images stay previews.
  const mine = !isAssistant ? attachmentsOf({ file_urls, file_meta }) : [];
  const fileCards = mine.filter((a) => a.kind !== "image");
  const imageUrls = !isAssistant ? mine.filter((a) => a.kind === "image").map((a) => a.url) : file_urls;
  const showBubble = isAssistant || !!content?.trim() || imageUrls.length > 0 || fileCards.length === 0;

  return (
    <div className="max-w-full">
      {fileCards.length > 0 && (
        <div className={`flex flex-wrap justify-end gap-2 ${showBubble ? "mb-2" : ""}`}>
          {fileCards.map((a, i) => <FileAttachmentCard key={`${a.url}-${i}`} name={a.name} label={a.label} url={a.url} />)}
        </div>
      )}
      {showBubble && <div className={`max-w-3xl rounded-2xl px-4 py-3 ${sizeClass} ${isAssistant ? "" : "whitespace-pre-wrap"} break-words [overflow-wrap:anywhere] ${role === "user" ? "ml-auto bg-white text-black" : "bg-white/[0.055] text-neutral-200"}`}>
        <MessageContent content={content} markdown={isAssistant} zipSource={isAssistant ? zipSource : null} onSend={isAssistant ? onSend : null} interactive={isAssistant && isLast && !local} />
        {gameIntent && <GameCenter key={`${gameIntent}-${String(content).slice(0, 48)}`} initialGame={gameIntent} />}
        {file_urls?.length > 0 && (
          role === "assistant"
            ? <div className={`mt-3 grid gap-2 ${file_urls.length > 1 ? "sm:grid-cols-2" : "max-w-lg"}`}>{file_urls.map((url, index) => <GeneratedImage key={`${url}-${index}`} url={url} fresh={fresh} />)}</div>
            : imageUrls.length > 0 && <UserAttachments urls={imageUrls} />
        )}
        {isAssistant && images && <ImageGallery images={images} onRetry={onRetryImages} />}
      </div>}

      {isAssistant && !local && hasContent && (
        <MessageActions
          content={content}
          canRegenerate={isLast}
          onRegenerate={onRegenerate}
          regenerateDisabled={regenerateDisabled}
        />
      )}
    </div>
  );
}



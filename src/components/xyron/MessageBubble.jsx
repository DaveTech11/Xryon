import React, { useEffect, useState } from "react";
import { Download, ExternalLink, Paperclip } from "lucide-react";
import { getSetting } from "../../lib/settings";
import EntityPreview from "./EntityPreview";
import ComparisonPreview from "./ComparisonPreview";
import MessageActions from "./MessageActions";
import MessageContent from "./MessageContent";
import ImageViewer from "./ImageViewer";
import ImageGallery from "./ImageGallery";
import FileAttachmentCard from "./FileAttachmentCard";
import { attachmentsOf } from "../../lib/fileKinds";

const FONT_SIZE_CLASS = { sm: "text-xs", md: "text-sm", lg: "text-base" };

// A freshly generated image reveals itself blurred → sharp with a light
// sweep, then fades in its controls — instead of just popping in. Uploaded
// (user) attachments skip this and render immediately.
function GeneratedImage({ url }) {
  const [sharp, setSharp] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setTimeout(() => setSharp(true), 30));
    return () => cancelAnimationFrame(t);
  }, [url]);
  return (
    <div className="group relative overflow-hidden rounded-xl border border-black/10 bg-black/5">
      <img
        src={url}
        alt="Generated"
        className="max-h-96 w-full object-cover transition-[filter,opacity] duration-700 ease-out"
        style={{ filter: sharp ? "blur(0px)" : "blur(18px)", opacity: sharp ? 1 : 0.55, transform: sharp ? "scale(1)" : "scale(1.03)" }}
      />
      {sharp && <span className="reveal-sweep pointer-events-none absolute inset-0" />}
      <div className={`absolute bottom-2 right-2 flex gap-1.5 transition-opacity duration-500 ${sharp ? "opacity-0 group-hover:opacity-100" : "opacity-0"}`}>
        <a href={url} download target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80" aria-label="Download image"><Download className="h-3.5 w-3.5" /></a>
        <a href={url} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-lg bg-black/60 text-white hover:bg-black/80" aria-label="Open image"><ExternalLink className="h-3.5 w-3.5" /></a>
      </div>
      <style>{`
        .reveal-sweep { background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%); background-size: 250% 250%; animation: reveal-sweep 0.9s ease-out; }
        @keyframes reveal-sweep { from { background-position: 120% 0; } to { background-position: -20% 0; } }
        @media (prefers-reduced-motion: reduce) { .reveal-sweep { animation: none; display: none; } }
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
  zipSource = null,
  onRetryImages,
  local = false,
  isLast = false,
  onRegenerate,
  regenerateDisabled = false,
}) {
  if (preview) return <EntityPreview preview={preview} />;
  if (comparison) return <ComparisonPreview comparison={comparison} />;
  const sizeClass = FONT_SIZE_CLASS[getSetting("fontSize", "md")] || "text-sm";
  const isAssistant = role === "assistant";
  const hasContent = !!(content?.trim() || file_urls?.length > 0);

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
        <MessageContent content={content} markdown={isAssistant} zipSource={isAssistant ? zipSource : null} />
        {file_urls?.length > 0 && (
          role === "assistant"
            ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{file_urls.map((url, index) => <GeneratedImage key={`${url}-${index}`} url={url} />)}</div>
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



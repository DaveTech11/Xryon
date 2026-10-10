import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Paperclip, Pencil, Share2 } from "lucide-react";
import { copyToClipboard } from "../../lib/clipboard";
import { getSetting } from "../../lib/settings";
import EntityPreview from "./EntityPreview";
import ComparisonPreview from "./ComparisonPreview";
import MessageActions from "./MessageActions";
import MessageContent from "./MessageContent";
import ImageViewer from "./ImageViewer";
import ImageGallery from "./ImageGallery";

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

const actionBtn = "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 transition hover:bg-white/10 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 active:scale-95 disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8";

// The person's own message: copy / share / edit under it. Edit turns the bubble into a text box;
// "Send" re-asks the edited text and the old answer (and anything after it) is removed.
function UserMessage({ content, file_urls, sizeClass, canEdit, onEditSend }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content || "");
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const areaRef = useRef(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!editing || !areaRef.current) return;
    const el = areaRef.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  useEffect(() => {
    const el = areaRef.current;
    if (!editing || !el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [draft, editing]);

  const hasText = !!content?.trim();
  const flash = (t) => { setNote(t); clearTimeout(timer.current); timer.current = setTimeout(() => setNote(""), 1600); };

  const copy = async () => {
    try { await copyToClipboard(content); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500); }
    catch { flash("Couldn't copy"); }
  };
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ text: content }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    try { await copyToClipboard(content); flash("Copied to share"); } catch { flash("Couldn't share"); }
  };
  const startEdit = () => { setDraft(content || ""); setEditing(true); };
  const cancel = () => { setEditing(false); setDraft(content || ""); };
  const changed = draft.trim() && draft.trim() !== (content || "").trim();
  const send = () => {
    if (!changed) return;
    setEditing(false);
    onEditSend?.(draft.trim());
  };

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-3xl rounded-3xl bg-[#2b2b2e] p-3 sm:p-4">
        <textarea
          ref={areaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
          }}
          rows={2}
          aria-label="Edit your message"
          className="block max-h-80 w-full resize-none bg-transparent px-1 text-base leading-relaxed text-white outline-none sm:text-[15px]"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={cancel} className="h-10 rounded-full border border-white/15 px-5 text-sm font-medium text-white transition hover:bg-white/10 active:scale-95">Cancel</button>
          <button type="button" onClick={send} disabled={!changed} className="h-10 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">Send</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-full flex-col items-end">
      <div className={`w-fit max-w-[88%] whitespace-pre-wrap break-words rounded-2xl bg-white px-4 py-3 text-black [overflow-wrap:anywhere] sm:max-w-[75%] ${sizeClass}`}>
        <MessageContent content={content} markdown={false} />
        {file_urls?.length > 0 && <UserAttachments urls={file_urls} />}
      </div>
      {hasText && (
        <div role="group" aria-label="Your message actions" className="relative mt-1 flex items-center justify-end gap-0.5">
          {note && <span role="status" className="mr-1 rounded-md bg-[#101012] px-2 py-1 text-xs text-emerald-400">{note}</span>}
          <button type="button" onClick={copy} className={`${actionBtn} ${copied ? "text-emerald-400" : ""}`} aria-label={copied ? "Copied" : "Copy message"} title={copied ? "Copied" : "Copy"}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          <button type="button" onClick={share} className={actionBtn} aria-label="Share message" title="Share"><Share2 className="h-4 w-4" /></button>
          {canEdit && <button type="button" onClick={startEdit} className={actionBtn} aria-label="Edit message" title="Edit message"><Pencil className="h-4 w-4" /></button>}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({
  role,
  content,
  file_urls = [],
  preview = null,
  comparison = null,
  images = null,
  zipSource = null,
  onRetryImages,
  canEdit = false,
  onEditSend,
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
  if (role === "user" && !local) return <UserMessage content={content} file_urls={file_urls} sizeClass={sizeClass} canEdit={canEdit} onEditSend={onEditSend} />;

  return (
    <div className="max-w-full">
      <div className={`max-w-3xl rounded-2xl px-4 py-3 ${sizeClass} ${isAssistant ? "" : "whitespace-pre-wrap"} break-words [overflow-wrap:anywhere] ${role === "user" ? "ml-auto bg-white text-black" : "bg-white/[0.055] text-neutral-200"}`}>
        <MessageContent content={content} markdown={isAssistant} zipSource={isAssistant ? zipSource : null} />
        {file_urls?.length > 0 && (
          role === "assistant"
            ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{file_urls.map((url, index) => <GeneratedImage key={`${url}-${index}`} url={url} />)}</div>
            : <UserAttachments urls={file_urls} />
        )}
        {isAssistant && images && <ImageGallery images={images} onRetry={onRetryImages} />}
      </div>

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



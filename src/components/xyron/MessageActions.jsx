import React, { useEffect, useRef, useState } from "react";
import { Copy, Check, RotateCcw, ThumbsUp, ThumbsDown, MoreHorizontal, Flag, Download, Share2, FileText, LoaderCircle, AlertCircle } from "lucide-react";
import { api } from "../../api/client";

// Clipboard API first (works on Chrome/Edge/Safari/Android/iOS Safari over
// HTTPS), falling back to a hidden-textarea + execCommand for contexts where
// the Clipboard API is unavailable or permission is denied.
function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("execCommand copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // permission denied or blocked — fall through to the legacy path
    }
  }
  await legacyCopy(text);
}

const iconBtn =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-neutral-500 transition duration-150 hover:bg-white/10 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 active:scale-[0.94] disabled:pointer-events-none disabled:opacity-30";

export default function MessageActions({ content = "", canRegenerate = false, onRegenerate, regenerateDisabled = false }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null); // "up" | "down" | null
  const [moreOpen, setMoreOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState("");
  const copyTimer = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  useEffect(() => {
    if (!moreOpen) return;
    const onDocClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMoreOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMoreOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const hasText = !!content?.trim();

  const handleCopy = async () => {
    if (!hasText) return;
    try {
      await copyToClipboard(content);
    } catch {
      // clipboard genuinely unavailable in this context — nothing more we can do
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const toggleFeedback = (type) => setFeedback((current) => (current === type ? null : type));

  const [menuNote, setMenuNote] = useState("");
  const note = (t) => { setMenuNote(t); setTimeout(() => setMenuNote(""), 1600); };

  const copyMarkdown = async () => {
    try { await copyToClipboard(content); note("Copied as Markdown"); } catch { note("Couldn't copy"); }
    setMoreOpen(false);
  };

  const downloadResponse = () => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = "xyron-response.md"; a.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
  };

  const shareResponse = async () => {
    setMoreOpen(false);
    try {
      if (navigator.share) { await navigator.share({ title: "Xyron response", text: content }); return; }
    } catch (e) { if (e?.name === "AbortError") return; }
    try { await copyToClipboard(content); note("Copied to share"); } catch { note("Couldn't share"); }
  };

  const reportResponse = async () => {
    if (reported || reporting) return;
    setReporting(true);
    setReportError("");
    try {
      await api.feedback.send({
        type: "feedback",
        message: `Report response: ${content.slice(0, 5000) || "(empty response)"}`,
        page: `${window.location.pathname} — response report`,
      });
      setReported(true);
      setMoreOpen(false);
    } catch (error) {
      setReportError(error?.message || "Could not submit report. Please try again.");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div role="group" aria-label="Message actions" className="xyron-msg-actions mt-1.5 flex w-fit max-w-full flex-wrap items-center gap-0.5">
      {hasText && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Copied to clipboard" : "Copy response"}
          title={copied ? "Copied" : "Copy"}
          className={`${iconBtn} ${copied ? "text-emerald-400" : ""}`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="hidden text-xs font-medium sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>
      )}

      {canRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerateDisabled}
          aria-label="Regenerate response"
          title="Regenerate"
          className={iconBtn}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden text-xs font-medium sm:inline">Regenerate</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => toggleFeedback("up")}
        aria-label={feedback === "up" ? "Remove like" : "Like this response"}
        aria-pressed={feedback === "up"}
        title="Like"
        className={`xact-like ${iconBtn} ${feedback === "up" ? "bg-white/10 text-white" : ""}`}
      >
        <ThumbsUp className="h-3.5 w-3.5" fill={feedback === "up" ? "currentColor" : "none"} />
      </button>

      <button
        type="button"
        onClick={() => toggleFeedback("down")}
        aria-label={feedback === "down" ? "Remove dislike" : "Dislike this response"}
        aria-pressed={feedback === "down"}
        title="Dislike"
        className={`xact-dislike ${iconBtn} ${feedback === "down" ? "bg-white/10 text-white" : ""}`}
      >
        <ThumbsDown className="h-3.5 w-3.5" fill={feedback === "down" ? "currentColor" : "none"} />
      </button>

      <div ref={menuRef} className="xact-more relative">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          title="More"
          className={`${iconBtn} ${moreOpen ? "bg-white/10 text-white" : ""}`}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {moreOpen && (
          <div role="menu" className="absolute left-0 top-full z-30 mt-1.5 w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-[#101012] p-1 shadow-2xl shadow-black/40">
            {hasText && (
              <>
                <button type="button" role="menuitem" onClick={copyMarkdown} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-300 transition hover:bg-white/10 hover:text-white">
                  <FileText className="h-3.5 w-3.5" /> Copy as Markdown
                </button>
                <button type="button" role="menuitem" onClick={downloadResponse} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-300 transition hover:bg-white/10 hover:text-white">
                  <Download className="h-3.5 w-3.5" /> Download (.md)
                </button>
                <button type="button" role="menuitem" onClick={shareResponse} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-300 transition hover:bg-white/10 hover:text-white">
                  <Share2 className="h-3.5 w-3.5" /> Share
                </button>
                <div className="my-1 h-px bg-white/10" />
              </>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={reportResponse} disabled={reported || reporting}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-neutral-300 transition hover:bg-white/10 hover:text-white"
            >
              {reporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : reported ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Flag className="h-3.5 w-3.5" />} {reporting ? "Sending report…" : reported ? "Reported — thanks" : "Report response"}
            </button>
          </div>
        )}
        {menuNote && <p role="status" className="absolute left-0 top-full mt-1.5 whitespace-nowrap rounded-lg bg-[#101012] px-2.5 py-1.5 text-xs text-emerald-400 border border-white/10">{menuNote}</p>}
        {reportError && <p role="alert" className="mt-1 max-w-56 text-xs text-red-400"><AlertCircle className="mr-1 inline h-3 w-3" />{reportError}</p>}
      </div>
    </div>
  );
}

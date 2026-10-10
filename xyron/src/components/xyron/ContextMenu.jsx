import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Share2, Download, LifeBuoy, MessageSquareText, Bug, Trash2, Check } from "lucide-react";

const row = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export default function ContextMenu({
  open,
  onClose,
  onClearChat,
  onShare,
  onExport,
  onHelp,
  onFeedback,
  onReportBug,
  hasMessages = true,
}) {
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState(""); // "share" | "export" when there is nothing to use yet
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setHint("");
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const nothingYet = (which) => { setHint(which); clearTimeout(timer.current); timer.current = setTimeout(() => setHint(""), 1800); };

  if (!open) return null;

  const pick = (fn) => () => { onClose?.(); fn?.(); };

  const share = async () => {
    if (!hasMessages) return nothingYet("share");
    let result;
    try { result = await onShare?.(); } catch { /* clipboard blocked */ }
    setCopied(result === "shared" ? "shared" : true);
    timer.current = setTimeout(() => onClose?.(), 900);
  };

  // Rendered into <body> (not inside the header) so the click-away layer always covers the
  // whole screen and the menu always sits above the chat.
  return createPortal(
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div
        role="menu"
        className="absolute right-3 top-[4.25rem] w-64 rounded-2xl border border-white/20 bg-[#161618] p-2 shadow-2xl shadow-black/80"
        onClick={(e) => e.stopPropagation()}
      >
        <button role="menuitem" type="button" onClick={share} className={`${row} ${!hasMessages ? "text-neutral-500" : ""}`}>
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4 text-neutral-400" />}
          {copied ? (copied === "shared" ? "Shared" : "Chat copied") : hint === "share" ? "Send a message first" : "Share chat"}
        </button>
        <button role="menuitem" type="button" onClick={hasMessages ? pick(onExport) : () => nothingYet("export")} className={`${row} ${!hasMessages ? "text-neutral-500" : ""}`}>
          <Download className="h-4 w-4 text-neutral-400" /> {hint === "export" ? "Send a message first" : "Export chat"}
        </button>

        <div className="my-1.5 h-px bg-white/10" />

        <button role="menuitem" type="button" onClick={pick(onFeedback)} className={row}>
          <MessageSquareText className="h-4 w-4 text-neutral-400" /> Send feedback
        </button>
        <button role="menuitem" type="button" onClick={pick(onReportBug)} className={row}>
          <Bug className="h-4 w-4 text-neutral-400" /> Report a bug
        </button>
        <button role="menuitem" type="button" onClick={pick(onHelp)} className={row}>
          <LifeBuoy className="h-4 w-4 text-neutral-400" /> Help &amp; support
        </button>

        <div className="my-1.5 h-px bg-white/10" />

        <button
          role="menuitem"
          type="button"
          onClick={pick(onClearChat)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" /> Clear chat
        </button>
      </div>
    </div>,
    document.body
  );
}

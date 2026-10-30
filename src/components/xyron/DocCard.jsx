import React, { useEffect, useState } from "react";
import { Check, Copy, FileText, Mail, Maximize2, Sparkles, X } from "lucide-react";
import { copyToClipboard } from "../../lib/clipboard";
import { openInGmail, toPlainText } from "../../lib/mailDraft";
import MarkdownText from "./MarkdownText";

// A finished prompt or report/email as a card (like ChatGPT's document cards):
//   header : icon + title            [copy] [gmail, reports only] [expand]
//   body   : the text, clipped with a fade - tap it (or the expand icon) to read all of it
// Reports get a Gmail button that opens a ready draft with the same text.

const KIND = {
  prompt: { label: "Prompt", Icon: Sparkles },
  report: { label: "Report", Icon: FileText },
};

function useStatus() {
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!status) return undefined;
    const t = setTimeout(() => setStatus(""), 2600);
    return () => clearTimeout(t);
  }, [status]);
  return [status, setStatus];
}

function IconButton({ label, onClick, children, active = false }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:bg-white/10 active:scale-95 ${active ? "text-emerald-400" : "text-neutral-300 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function useActions({ kind, subject, body }, setStatus) {
  const copy = async () => {
    try { await copyToClipboard(kind === "report" ? toPlainText(body) : body); setStatus("Copied"); }
    catch { setStatus("Couldn't copy"); }
  };
  const gmail = () => {
    const { copied } = openInGmail({ subject, markdown: body });
    setStatus(copied ? "Copied - paste it in Gmail" : "Opening Gmail");
  };
  return { copy, gmail };
}

function DocModal({ data, onClose }) {
  const [status, setStatus] = useStatus();
  const { copy, gmail } = useActions(data, setStatus);
  const { label, Icon } = KIND[data.kind];
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#1b1b1d] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-200">{data.title}</span>
          {status && <span className="shrink-0 text-xs text-emerald-400">{status}</span>}
          <IconButton label="Close" onClick={onClose}><X className="h-4 w-4" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 text-[15px] text-neutral-200"><MarkdownText text={data.body} /></div>
        <div className="flex gap-2 border-t border-white/10 p-3">
          <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/10">
            <Copy className="h-4 w-4" /> Copy
          </button>
          {data.kind === "report" && (
            <button type="button" onClick={gmail} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-neutral-200">
              <Mail className="h-4 w-4" /> Open in Gmail
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocCard({ data }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useStatus();
  const { copy, gmail } = useActions(data, setStatus);
  const { Icon } = KIND[data.kind];
  const done = status === "Copied";

  return (
    <>
      <div className="my-3 max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#2a2a2c]">
        <div className="flex items-center gap-2 pl-4 pr-2 pt-2.5 text-neutral-400">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium uppercase tracking-wide">{status || data.title}</span>
          <IconButton label="Copy" onClick={copy} active={done}>{done ? <Check className="h-[18px] w-[18px]" /> : <Copy className="h-[18px] w-[18px]" />}</IconButton>
          {data.kind === "report" && <IconButton label="Send in Gmail" onClick={gmail}><Mail className="h-[18px] w-[18px]" /></IconButton>}
          <IconButton label="Expand" onClick={() => setOpen(true)}><Maximize2 className="h-[18px] w-[18px]" /></IconButton>
        </div>
        <div className="relative cursor-pointer px-5 pb-5 pt-2 text-[15px] text-neutral-200" onClick={() => setOpen(true)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}>
          <div className="max-h-64 overflow-hidden"><MarkdownText text={data.body} /></div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#2a2a2c] to-transparent" />
        </div>
      </div>
      {open && <DocModal data={data} onClose={() => setOpen(false)} />}
    </>
  );
}

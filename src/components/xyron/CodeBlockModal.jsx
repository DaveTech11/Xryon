import React, { useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { copyToClipboard } from "../../lib/clipboard";

const LANG_LABELS = {
  js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", py: "Python",
  html: "HTML", css: "CSS", json: "JSON", bash: "Shell", sh: "Shell",
  shell: "Shell", sql: "SQL", md: "Markdown", text: "Text", yaml: "YAML",
  yml: "YAML", txt: "Text",
};

export default function CodeBlockModal({ lang = "", path = "", value = "", onClose }) {
  const [copied, setCopied] = useState(false);
  const label = path || LANG_LABELS[lang.toLowerCase()] || (lang ? lang.toUpperCase() : "Copyable text");

  const handleCopy = async () => {
    try { await copyToClipboard(value); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
          <span className="truncate text-sm font-medium text-neutral-200">{label}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition hover:bg-white/10 hover:text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto px-4 py-4 text-[13px] leading-relaxed text-neutral-200">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
}

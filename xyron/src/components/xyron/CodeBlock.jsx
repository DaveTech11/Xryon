import React, { useState } from "react";
import { Copy, Check, Maximize2, Download, Play } from "lucide-react";
import { copyToClipboard } from "../../lib/clipboard";
import CodeSandbox from "./CodeSandbox";
import { downloadTextFile } from "../../lib/downloadFile";

const LANG_LABELS = {
  js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", py: "Python",
  html: "HTML", css: "CSS", json: "JSON", bash: "Shell", sh: "Shell",
  shell: "Shell", sql: "SQL", md: "Markdown", text: "Text", yaml: "YAML",
  yml: "YAML", txt: "Text",
};

export default function CodeBlock({ lang = "", path = "", value = "", onExpand }) {
  const [copied, setCopied] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const runnable = ["js", "javascript", "html"].includes(lang.toLowerCase()) && !/\.(jsx|tsx)$/i.test(path);
  const label = path || LANG_LABELS[lang.toLowerCase()] || (lang ? lang.toUpperCase() : "Copyable text");

  const handleCopy = async () => {
    try { await copyToClipboard(value); } catch { /* clipboard unavailable */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="my-2 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#151517]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3.5 py-2">
        <span className="truncate text-xs font-medium text-neutral-400">{label}</span>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? "Copied" : "Copy"}
            aria-label={copied ? "Copied" : "Copy"}
            className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {runnable && (
            <button
              type="button"
              onClick={() => setSandboxOpen(true)}
              title="Run in sandbox"
              aria-label="Run in sandbox"
              className="grid h-7 w-7 place-items-center rounded-lg text-emerald-400 transition hover:bg-white/10"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          {path && (
            <button
              type="button"
              onClick={() => downloadTextFile(path, value)}
              title="Download file"
              aria-label="Download file"
              className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          )}
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title="Expand"
              aria-label="Expand"
              className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <pre className="max-h-96 overflow-auto px-3.5 py-3 text-[12.5px] leading-relaxed text-neutral-200">
        <code>{value}</code>
      </pre>
      {sandboxOpen && <CodeSandbox lang={lang} value={value} onClose={() => setSandboxOpen(false)} />}
    </div>
  );
}

import React, { useMemo, useState } from "react";
import { Copy, Check, Maximize2, Download, Play, Eye, Code2 } from "lucide-react";
import { copyToClipboard } from "../../lib/clipboard";
import CodeSandbox from "./CodeSandbox";
import { downloadTextFile } from "../../lib/downloadFile";

const LANG_LABELS = {
  js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", py: "Python",
  html: "HTML", css: "CSS", json: "JSON", bash: "Shell", sh: "Shell",
  shell: "Shell", sql: "SQL", md: "Markdown", text: "Text", yaml: "YAML",
  yml: "YAML", txt: "Text", svg: "SVG",
};

// SVG replies are shown as a real image (drawn through <img>, so scripts inside an SVG never run).
function svgDataUrl(value) {
  let svg = String(value || "").trim().replace(/^<\?xml[^>]*\?>\s*/i, "");
  if (!/^<svg[\s>]/i.test(svg)) return null;
  if (!/<svg[^>]*\sxmlns\s*=/i.test(svg)) svg = svg.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function CodeBlock({ lang = "", path = "", value = "", onExpand }) {
  const [copied, setCopied] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const svgUrl = useMemo(() => (["svg", "xml", ""].includes(lang.toLowerCase()) ? svgDataUrl(value) : null), [lang, value]);
  const [showCode, setShowCode] = useState(false);
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
          {svgUrl && (
            <>
              <button type="button" onClick={() => setShowCode(false)} title="Preview" aria-label="Preview"
                className={`grid h-7 w-7 place-items-center rounded-lg transition hover:bg-white/10 ${!showCode ? "text-white" : "text-neutral-400"}`}>
                <Eye className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => setShowCode(true)} title="Code" aria-label="Code"
                className={`grid h-7 w-7 place-items-center rounded-lg transition hover:bg-white/10 ${showCode ? "text-white" : "text-neutral-400"}`}>
                <Code2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => downloadTextFile(path || "image.svg", value)} title="Download SVG" aria-label="Download SVG"
                className="grid h-7 w-7 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white">
                <Download className="h-3.5 w-3.5" />
              </button>
            </>
          )}
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
      {svgUrl && !showCode ? (
        <div className="flex justify-center bg-white p-3">
          <img src={svgUrl} alt="SVG preview" className={`max-h-96 max-w-full ${/<svg[^>]*\swidth\s*=/i.test(value) ? "w-auto" : "w-full max-w-md"}`} />
        </div>
      ) : (
        <pre className="max-h-96 overflow-auto px-3.5 py-3 text-[12.5px] leading-relaxed text-neutral-200">
          <code>{value}</code>
        </pre>
      )}
      {sandboxOpen && <CodeSandbox lang={lang} value={value} onClose={() => setSandboxOpen(false)} />}
    </div>
  );
}

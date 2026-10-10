import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openXyronLabs } from "./XyronLabsModal";

// Renders the prose between code blocks. Fenced code is split out earlier by
// parseContentBlocks() and drawn by <CodeBlock>, so this only has to style
// headings, bold/italic, lists, tables, links, quotes and inline code.
// Styling lives here (no typography plugin) so it matches the black theme.
const components = {
  h1: ({ children }) => <h1 className="mb-2 mt-5 text-xl font-semibold text-white first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-5 text-lg font-semibold text-white first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-4 text-base font-semibold text-white first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold text-white first:mt-0">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-neutral-400">{children}</del>,
  a: ({ href, children }) => href === "#xyron-labs" ? (
    <button type="button" onClick={openXyronLabs} className="font-medium text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:decoration-sky-400">
      {children}
    </button>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:decoration-sky-400">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-neutral-500">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-neutral-400">{children}</ol>,
  li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-white/20 pl-3 text-neutral-400">{children}</blockquote>,
  hr: () => <hr className="my-4 border-white/10" />,
  table: ({ children }) => (
    <div className="my-3 max-w-full overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-left text-[0.92em]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-white/[0.06]">{children}</thead>,
  th: ({ children }) => <th className="border-b border-white/10 px-3 py-2 font-semibold text-white">{children}</th>,
  td: ({ children }) => <td className="border-t border-white/5 px-3 py-2 align-top">{children}</td>,
  // Fences are normally extracted before this runs; this only catches an
  // unclosed fence so it still looks like code instead of raw backticks.
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-auto rounded-xl border border-white/10 bg-[#151517] px-3.5 py-3 text-[12.5px] leading-relaxed text-neutral-200 whitespace-pre">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className || "") || String(children).includes("\n");
    return isBlock
      ? <code className={className}>{children}</code>
      : <code className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.88em] text-neutral-100">{children}</code>;
  },
};

export default function MarkdownText({ text = "" }) {
  if (!text.trim()) return null;
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>;
}

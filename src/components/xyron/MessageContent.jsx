import React, { useMemo, useState } from "react";
import { parseContentBlocks } from "../../lib/codeBlocks";
import CodeBlock from "./CodeBlock";
import CodeBlockModal from "./CodeBlockModal";
import FileCards from "./FileCard";
import MarkdownText from "./MarkdownText";
import { AskForm, ItemList, PicksList } from "./RichCards";
import DocCard from "./DocCard";
import ImageSections from "./ImageSections";
import { formatAnswers, splitDocs, splitRich } from "../../lib/richBlocks";
import { splitBuildReply } from "../../lib/zipMode";

// Edits a person makes to a file in the viewer are kept in this browser (per file + original text), so they
// survive closing the viewer and reloading the page, and the Download / ZIP cards use the edited version.
const editKey = (path, original) => {
  let h = 0;
  const t = String(original || "");
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return `xyron_edit:${path || "snippet"}:${t.length}:${h}`;
};
const readEdit = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const writeEdit = (key, text, original) => {
  try { if (text === original) localStorage.removeItem(key); else localStorage.setItem(key, text); } catch { /* storage full or blocked: edit still lives until reload */ }
};

function Segment({ content = "", markdown = false, zipSource = null, onSend = null, interactive = false }) {
  const parsed = useMemo(() => parseContentBlocks(content || ""), [content]);
  // person's saved edits, by block index
  const [edits, setEdits] = useState({});
  const blocks = useMemo(() => parsed.map((b, i) => {
    if (b.type !== "code") return b;
    const e = edits[i] ?? readEdit(editKey(b.path, b.value));
    return e != null && e !== b.value ? { ...b, value: e, original: b.value } : { ...b, original: b.value };
  }), [parsed, edits]);
  const saveEdit = (i, text) => {
    const b = parsed[i];
    if (!b) return;
    writeEdit(editKey(b.path, b.value), text, b.value);
    setEdits((cur) => ({ ...cur, [i]: text }));
  };
  // Blocks tagged `path=...` are files: they show as download cards (one card for a
  // single file, one ZIP card for several) instead of a wall of code. Plain
  // snippets without a path stay as normal code blocks.
  const files = useMemo(
    () => blocks.map((b, index) => ({ ...b, index })).filter((b) => b.type === "code" && b.path),
    [blocks],
  );
  const firstFileIndex = files.length ? files[0].index : -1;
  // Codex-style build reply (PROJECT / PLAN / files / SUMMARY): the labels become tidy headings and the ZIP is named after the project.
  const build = useMemo(() => (files.length ? splitBuildReply(content) : null), [content, files.length]);
  const tidy = (text) => (build
    ? text
      .replace(/^\s*PROJECT:\s*(.+)$/im, (_m, name) => `**Project:** \`${name.trim()}\``)
      .replace(/^\s*PLAN:\s*$/im, "**Plan**")
      .replace(/^\s*SUMMARY:\s*$/im, "**Summary**")
      .replace(/^\s*SUMMARY:\s+(\S)/im, "**Summary**\n\n$1")
    : text);
  const [expandedIndex, setExpandedIndex] = useState(null);

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "code" && block.path) {
          return i === firstFileIndex ? <FileCards key={i} files={files} onView={setExpandedIndex} zipSource={zipSource} projectName={build?.project || ""} /> : null;
        }
        return block.type === "code" ? (
          <CodeBlock key={i} lang={block.lang} path={block.path} value={block.value} onExpand={() => setExpandedIndex(i)} />
        ) : (
          tidy(block.value) && (markdown ? (
            <React.Fragment key={i}>
              {splitRich(tidy(block.value)).map((part, j) => {
                if (part.type === "list") return <ItemList key={j} data={part.data} />;
                if (part.type === "picks") return <PicksList key={j} data={part.data} />;
                if (part.type === "images") return <ImageSections key={j} data={part.data} />;
                if (part.type === "ask") return <AskForm key={j} data={part.data} interactive={interactive && !!onSend} onSubmit={(answers) => onSend(formatAnswers(part.data, answers))} />;
                return <MarkdownText key={j} text={part.value} />;
              })}
            </React.Fragment>
          ) : <React.Fragment key={i}>{tidy(block.value)}</React.Fragment>)
        );
      })}

      {expandedIndex !== null && blocks[expandedIndex] && (
        <CodeBlockModal
          lang={blocks[expandedIndex].lang}
          path={blocks[expandedIndex].path}
          value={blocks[expandedIndex].value}
          original={blocks[expandedIndex].original}
          onSave={(text) => saveEdit(expandedIndex, text)}
          onClose={() => setExpandedIndex(null)}
        />
      )}
    </>
  );
}

// Prompt / report cards are cut out first (their text may contain ``` fences of its own);
// everything around them goes through the normal pipeline above.
export default function MessageContent({ content = "", markdown = false, ...rest }) {
  const parts = useMemo(() => (markdown ? splitDocs(content || "") : [{ type: "text", value: content || "" }]), [content, markdown]);
  if (parts.length === 1 && parts[0].type === "text") return <Segment content={content} markdown={markdown} {...rest} />;
  return (
    <>
      {parts.map((part, i) => (part.type === "doc"
        ? <DocCard key={i} data={part.data} />
        : part.value.trim() ? <Segment key={i} content={part.value} markdown={markdown} {...rest} /> : null))}
    </>
  );
}

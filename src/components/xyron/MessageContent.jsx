import React, { useMemo, useState } from "react";
import { parseContentBlocks } from "../../lib/codeBlocks";
import CodeBlock from "./CodeBlock";
import CodeBlockModal from "./CodeBlockModal";
import FileCards from "./FileCard";
import MarkdownText from "./MarkdownText";

export default function MessageContent({ content = "", markdown = false, zipSource = null }) {
  const blocks = useMemo(() => parseContentBlocks(content || ""), [content]);
  // Blocks tagged `path=...` are files: they show as download cards (one card for a
  // single file, one ZIP card for several) instead of a wall of code. Plain
  // snippets without a path stay as normal code blocks.
  const files = useMemo(
    () => blocks.map((b, index) => ({ ...b, index })).filter((b) => b.type === "code" && b.path),
    [blocks],
  );
  const firstFileIndex = files.length ? files[0].index : -1;
  const [expandedIndex, setExpandedIndex] = useState(null);

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "code" && block.path) {
          return i === firstFileIndex ? <FileCards key={i} files={files} onView={setExpandedIndex} zipSource={zipSource} /> : null;
        }
        return block.type === "code" ? (
          <CodeBlock key={i} lang={block.lang} path={block.path} value={block.value} onExpand={() => setExpandedIndex(i)} />
        ) : (
          block.value && (markdown ? <MarkdownText key={i} text={block.value} /> : <React.Fragment key={i}>{block.value}</React.Fragment>)
        );
      })}

      {expandedIndex !== null && blocks[expandedIndex] && (
        <CodeBlockModal
          lang={blocks[expandedIndex].lang}
          path={blocks[expandedIndex].path}
          value={blocks[expandedIndex].value}
          onClose={() => setExpandedIndex(null)}
        />
      )}
    </>
  );
}

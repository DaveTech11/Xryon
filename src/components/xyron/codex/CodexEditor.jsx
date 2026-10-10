import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, ChevronDown, ChevronUp, Replace, Loader2, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import CodeHighlight from "../CodeHighlight";
import { fileIconColor, lineAndColumn } from "./codexUtils";

function FindBar({ value, onClose, onCaret }) {
  const [q, setQ] = useState("");
  const [replacement, setReplacement] = useState("");
  const matches = useMemo(() => {
    if (!q) return [];
    const idxs = [];
    let i = 0;
    const hay = value.toLowerCase();
    const needle = q.toLowerCase();
    if (!needle) return idxs;
    while (true) {
      const found = hay.indexOf(needle, i);
      if (found === -1) break;
      idxs.push(found);
      i = found + needle.length;
    }
    return idxs;
  }, [q, value]);
  const [cursor, setCursor] = useState(0);

  const jump = (dir) => {
    if (!matches.length) return;
    const next = (cursor + dir + matches.length) % matches.length;
    setCursor(next);
    onCaret(matches[next], matches[next] + q.length);
  };

  return (
    <div className="codex-panel absolute right-3 top-2 z-30 flex items-center gap-1 px-2 py-1.5 shadow-xl">
      <Search className="h-3.5 w-3.5 text-[color:var(--codex-text-faint)]" />
      <input
        autoFocus
        value={q}
        onChange={(e) => { setQ(e.target.value); setCursor(0); }}
        onKeyDown={(e) => { if (e.key === "Enter") jump(e.shiftKey ? -1 : 1); if (e.key === "Escape") onClose(); }}
        placeholder="Find"
        className="codex-mono w-32 bg-transparent text-xs text-[color:var(--codex-text)] outline-none placeholder:text-[color:var(--codex-text-faint)]"
      />
      <span className="w-12 shrink-0 text-[10px] text-[color:var(--codex-text-faint)]">
        {matches.length ? `${cursor + 1}/${matches.length}` : "0/0"}
      </span>
      <button onClick={() => jump(-1)} className="text-[color:var(--codex-text-dim)] hover:text-white" aria-label="Previous match"><ChevronUp className="h-3.5 w-3.5" /></button>
      <button onClick={() => jump(1)} className="text-[color:var(--codex-text-dim)] hover:text-white" aria-label="Next match"><ChevronDown className="h-3.5 w-3.5" /></button>
      <div className="mx-1 h-4 w-px bg-[color:var(--codex-border)]" />
      <Replace className="h-3.5 w-3.5 text-[color:var(--codex-text-faint)]" />
      <input
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        placeholder="Replace"
        className="codex-mono w-24 bg-transparent text-xs text-[color:var(--codex-text)] outline-none placeholder:text-[color:var(--codex-text-faint)]"
      />
      <button
        onClick={() => {
          if (!q) return;
          onCaret(null, null, value.split(q).join(replacement));
        }}
        className="px-1.5 text-[10px] text-[color:var(--codex-cyan)] hover:underline"
      >
        All
      </button>
      <button onClick={onClose} className="ml-1 text-[color:var(--codex-text-dim)] hover:text-white" aria-label="Close find"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function EditorPane({ file, onChangeContent, phaseClass, phaseLabel, phase, showGutter = true, onCaretChange }) {
  const editorRef = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const [findOpen, setFindOpen] = useState(false);
  const [caret, setCaret] = useState(0);

  const content = file?.content || "";
  const lineCount = Math.max(1, content.split("\n").length);
  const { line, column } = lineAndColumn(content, caret);

  useEffect(() => {
    onCaretChange?.(line, column);
  }, [line, column, onCaretChange]);

  const syncScroll = (e) => {
    const top = e.target.scrollTop;
    if (preRef.current) preRef.current.scrollTop = top;
    if (gutterRef.current) gutterRef.current.scrollTop = top;
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setFindOpen(true);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.target;
      const start = el.selectionStart, end = el.selectionEnd;
      const next = content.slice(0, start) + "  " + content.slice(end);
      onChangeContent(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = start + 2; });
    }
  };

  const applyFindResult = (start, end, replaceAllValue) => {
    if (replaceAllValue != null) {
      onChangeContent(replaceAllValue);
      return;
    }
    const el = editorRef.current;
    if (!el || start == null) return;
    el.focus();
    el.setSelectionRange(start, end);
    setCaret(start);
  };

  const lineHeight = 20; // matches text-sm leading-relaxed used below (approx)

  return (
    <div className={`relative flex h-full w-full min-w-0 overflow-hidden ${phaseClass}`}>
      {showGutter && (
        <div
          ref={gutterRef}
          aria-hidden
          className="codex-mono hidden select-none overflow-hidden pt-3 text-right text-xs leading-relaxed text-[color:var(--codex-text-faint)] md:block md:w-12"
          style={{ background: "var(--codex-bg-raised)" }}
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i} className={i + 1 === line ? "px-2 text-[color:var(--codex-cyan)]" : "px-2"}>{i + 1}</div>
          ))}
        </div>
      )}
      <div className="relative h-full flex-1 min-w-0">
        <div className="codex-current-line" style={{ top: 12 + (line - 1) * lineHeight, height: lineHeight }} />
        <CodeHighlight ref={preRef} code={content} language={file?.language} />
        <textarea
          ref={editorRef}
          value={content}
          onChange={(e) => onChangeContent(e.target.value)}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => setCaret(e.target.selectionStart)}
          onClick={(e) => setCaret(e.target.selectionStart)}
          spellCheck={false}
          className="codex-mono relative h-full w-full resize-none bg-transparent p-3 text-sm leading-relaxed text-transparent caret-white outline-none md:p-5"
          placeholder="// Start coding or ask the AI to help..."
        />
        {findOpen && <FindBar value={content} onClose={() => setFindOpen(false)} onCaret={applyFindResult} />}
      </div>
      {phaseLabel && (
        <div className="codex-panel pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 px-3 py-1.5 text-[11px]">
          {phase === "success" ? <CheckCircle2 className="h-3 w-3 text-[color:var(--codex-green)]" />
            : phase === "fixing" ? <Zap className="h-3 w-3 animate-pulse text-[color:var(--codex-amber)]" />
            : phase === "error" ? <AlertCircle className="h-3 w-3 text-[color:var(--codex-red)]" />
            : <Loader2 className="h-3 w-3 animate-spin text-[color:var(--codex-cyan)]" />}
          <span style={{ color: phase === "success" ? "var(--codex-green)" : phase === "fixing" ? "var(--codex-amber)" : phase === "error" ? "var(--codex-red)" : "var(--codex-cyan)" }}>
            {phaseLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export default function CodexEditor({
  openFiles, activeFile, dirtyIds,
  onSelectTab, onCloseTab, onChangeContent,
  phaseClass, phaseLabel, phase,
  splitEnabled, secondaryFile, onChangeSecondaryContent,
  onCaretChange,
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {openFiles.length > 0 && (
        <div role="tablist" className="codex-scroll flex shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--codex-border)" }}>
          {openFiles.map((f) => {
            const active = activeFile?.id === f.id;
            const dirty = dirtyIds.has(f.id);
            return (
              <div
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => onSelectTab(f.id)}
                style={{ borderTop: active ? "2px solid var(--codex-cyan)" : "2px solid transparent", background: active ? "var(--codex-bg-raised)" : "transparent" }}
                className={`codex-mono group flex shrink-0 cursor-pointer items-center gap-2 px-3 py-2 text-xs ${active ? "text-white" : "text-[color:var(--codex-text-dim)] hover:bg-white/5"}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 ${fileIconColor(f.name)}`} />
                <span className="max-w-[130px] truncate">{f.name}</span>
                {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--codex-amber)]" />}
                <button onClick={(e) => { e.stopPropagation(); onCloseTab(f.id); }} className="text-[color:var(--codex-text-faint)] opacity-0 hover:text-white group-hover:opacity-100" aria-label={`Close ${f.name}`}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className={splitEnabled ? "min-w-0 flex-1" : "min-w-0 flex-1"} style={{ borderRight: splitEnabled ? "1px solid var(--codex-border)" : "none" }}>
          <EditorPane file={activeFile} onChangeContent={onChangeContent} phaseClass={phaseClass} phaseLabel={phaseLabel} phase={phase} onCaretChange={onCaretChange} />
        </div>
        {splitEnabled && (
          <div className="min-w-0 flex-1">
            <EditorPane file={secondaryFile} onChangeContent={onChangeSecondaryContent} phaseClass="" phaseLabel={null} phase={null} showGutter />
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import {
  FileCode, Search, Sparkles, TerminalSquare, Plus, FolderPlus, ChevronRight, ChevronDown,
  MoreHorizontal, Trash2, Copy, Pencil, Folder, AlertTriangle,
} from "lucide-react";
import { buildFileTree, fileIconColor, formatBytes } from "./codexUtils";

function FileRow({ node, depth, activeId, dirtyIds, onOpen, onRename, onDuplicate, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = activeId === node.file.id;
  const isDirty = dirtyIds.has(node.file.id);
  return (
    <div
      role="treeitem"
      aria-selected={isActive}
      tabIndex={0}
      onClick={() => onOpen(node.file)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(node.file); }}
      style={{ paddingLeft: 10 + depth * 14 }}
      className={`codex-mono group relative flex cursor-pointer items-center gap-2 py-1 pr-1.5 text-[12.5px] ${
        isActive ? "bg-white/[0.06] text-white" : "text-[color:var(--codex-text-dim)] hover:bg-white/[0.03] hover:text-[color:var(--codex-text)]"
      }`}
    >
      {isActive && <span className="codex-active-edge" />}
      <span className={`h-1.5 w-1.5 shrink-0 ${fileIconColor(node.name)}`} />
      <span className="flex-1 truncate">{node.name}</span>
      {isDirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--codex-amber)]" title="Unsaved changes" />}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
        className="shrink-0 text-[color:var(--codex-text-faint)] opacity-0 hover:text-white group-hover:opacity-100"
        aria-label={`Actions for ${node.name}`}
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div className="codex-panel absolute right-1 top-6 z-50 w-36 py-1 text-xs shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { onRename(node.file); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5">
              <Pencil className="h-3 w-3" /> Rename
            </button>
            <button onClick={() => { onDuplicate(node.file); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5">
              <Copy className="h-3 w-3" /> Duplicate
            </button>
            <button onClick={() => { onDelete(node.file); setMenuOpen(false); }} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[color:var(--codex-red)] hover:bg-white/5">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FolderRow({ node, depth, expanded, onToggle, children }) {
  const isOpen = expanded.has(node.path);
  return (
    <div>
      <button
        onClick={() => onToggle(node.path)}
        style={{ paddingLeft: 6 + depth * 14 }}
        className="flex w-full items-center gap-1.5 py-1 text-[11.5px] font-medium uppercase tracking-wide text-[color:var(--codex-text-dim)] hover:text-white"
      >
        {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <Folder className="h-3 w-3 shrink-0" />
        <span className="truncate normal-case">{node.name}</span>
      </button>
      {isOpen && children}
    </div>
  );
}

function Tree({ nodes, depth, expanded, onToggle, ...rowProps }) {
  return (
    <>
      {nodes.map((node) =>
        node.type === "folder" ? (
          <FolderRow key={node.path} node={node} depth={depth} expanded={expanded} onToggle={onToggle}>
            <Tree nodes={node.children} depth={depth + 1} expanded={expanded} onToggle={onToggle} {...rowProps} />
          </FolderRow>
        ) : (
          <FileRow key={node.file.id} node={node} depth={depth} {...rowProps} />
        )
      )}
    </>
  );
}

export default function CodexSidebar({
  view, onChangeView, // "explorer" | "search"
  files, activeFile, dirtyIds, errorCounts,
  onOpen, onCreateFile, onCreateFolder, onRename, onDuplicate, onDelete,
  aiPanelOpen, onToggleAi, terminalOpen, onToggleTerminal,
  width = 240,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const [query, setQuery] = useState("");

  const tree = useMemo(() => buildFileTree(files), [files]);
  const filteredFlat = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return files.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, query]);

  const toggleFolder = (path) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });

  const totalErrors = Object.values(errorCounts || {}).filter(Boolean).length;

  const rename = (file) => {
    const next = window.prompt("Rename file", file.name);
    if (next && next.trim() && next.trim() !== file.name) onRename(file, next.trim());
  };

  return (
    <div className="flex h-full" style={{ width }}>
      {/* Activity bar */}
      <div className="codex-panel flex w-12 shrink-0 flex-col items-center gap-1 border-r-0 py-2.5" style={{ borderRight: "1px solid var(--codex-border)" }}>
        <button
          onClick={() => onChangeView("explorer")}
          title="Explorer"
          aria-label="Explorer"
          className={`grid h-9 w-9 place-items-center ${view === "explorer" ? "codex-active-edge bg-white/[0.06] text-[color:var(--codex-cyan)]" : "text-[color:var(--codex-text-dim)] hover:bg-white/5 hover:text-white"}`}
        >
          <FileCode className="h-4 w-4" />
        </button>
        <button
          onClick={() => onChangeView("search")}
          title="Search"
          aria-label="Search files"
          className={`grid h-9 w-9 place-items-center ${view === "search" ? "codex-active-edge bg-white/[0.06] text-[color:var(--codex-cyan)]" : "text-[color:var(--codex-text-dim)] hover:bg-white/5 hover:text-white"}`}
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={onToggleAi}
          title="AI Assistant"
          aria-label="Toggle AI assistant"
          className={`relative grid h-9 w-9 place-items-center ${aiPanelOpen ? "codex-active-edge bg-white/[0.06] text-[color:var(--codex-cyan)]" : "text-[color:var(--codex-text-dim)] hover:bg-white/5 hover:text-white"}`}
        >
          <Sparkles className="h-4 w-4" />
        </button>
        <button
          onClick={onToggleTerminal}
          title="Terminal"
          aria-label="Toggle terminal"
          className={`grid h-9 w-9 place-items-center ${terminalOpen ? "codex-active-edge bg-white/[0.06] text-[color:var(--codex-cyan)]" : "text-[color:var(--codex-text-dim)] hover:bg-white/5 hover:text-white"}`}
        >
          <TerminalSquare className="h-4 w-4" />
        </button>
        {totalErrors > 0 && (
          <div className="mt-auto grid h-9 w-9 place-items-center text-[color:var(--codex-red)]" title={`${totalErrors} file(s) with errors`}>
            <AlertTriangle className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Panel */}
      <div className="codex-panel flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--codex-text-dim)]">
            {view === "search" ? "Search" : "Explorer"}
          </span>
          {view === "explorer" && (
            <div className="flex items-center gap-1.5">
              <button onClick={onCreateFolder} title="New folder" aria-label="New folder" className="text-[color:var(--codex-text-dim)] hover:text-white">
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button onClick={onCreateFile} title="New file" aria-label="New file" className="text-[color:var(--codex-text-dim)] hover:text-white">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {view === "search" && (
          <div className="px-2 pb-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter files by name…"
              className="codex-mono w-full border border-[color:var(--codex-border)] bg-black/30 px-2 py-1.5 text-xs text-[color:var(--codex-text)] outline-none placeholder:text-[color:var(--codex-text-faint)]"
            />
          </div>
        )}

        <div role="tree" className="codex-scroll flex-1 overflow-auto pb-3">
          {view === "explorer" ? (
            <>
              <div className="mx-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-widest text-[color:var(--codex-text-faint)]">XYRON-PROJECT</div>
              {tree.length === 0 ? (
                <p className="px-3 py-4 text-xs text-[color:var(--codex-text-faint)]">No files yet. Create one to start.</p>
              ) : (
                <Tree
                  nodes={tree}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggleFolder}
                  activeId={activeFile?.id}
                  dirtyIds={dirtyIds}
                  onOpen={onOpen}
                  onRename={rename}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              )}
            </>
          ) : (
            <div className="px-1">
              {(filteredFlat || []).map((f) => (
                <div
                  key={f.id}
                  onClick={() => onOpen(f)}
                  className="codex-mono flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px] text-[color:var(--codex-text-dim)] hover:bg-white/5 hover:text-white"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 ${fileIconColor(f.name)}`} />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-[10px] text-[color:var(--codex-text-faint)]">{formatBytes((f.content || "").length)}</span>
                </div>
              ))}
              {query.trim() && filteredFlat?.length === 0 && (
                <p className="px-3 py-4 text-xs text-[color:var(--codex-text-faint)]">No matches for "{query}".</p>
              )}
              {!query.trim() && <p className="px-3 py-4 text-xs text-[color:var(--codex-text-faint)]">Type to filter project files.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

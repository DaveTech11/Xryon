import React from "react";
import { GitBranch, AlertCircle, CheckCircle2 } from "lucide-react";

export default function CodexStatusBar({ activeFile, errorCount, line, column, phaseLabel, busy }) {
  return (
    <div
      className="flex items-center gap-4 px-3 py-1 text-[11px]"
      style={{ background: "var(--codex-bg-raised)", borderTop: "1px solid var(--codex-border)", color: "var(--codex-text-dim)" }}
    >
      <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" /> main</span>
      <span className="flex items-center gap-1">
        {errorCount > 0
          ? <><AlertCircle className="h-3 w-3" style={{ color: "var(--codex-red)" }} /> {errorCount}</>
          : <><CheckCircle2 className="h-3 w-3" style={{ color: "var(--codex-green)" }} /> 0</>}
      </span>
      <span className="ml-auto hidden sm:inline">Ln {line}, Col {column}</span>
      <span className="hidden sm:inline">{activeFile?.language || "plaintext"}</span>
      <span className="hidden sm:inline">UTF-8</span>
      <span className="flex min-w-[90px] items-center justify-end gap-1.5 text-right">
        <span className="h-1.5 w-1.5 rounded-full codex-status-dot" style={{ background: busy ? "var(--codex-amber)" : "var(--codex-cyan)" }} />
        {phaseLabel || "Ready"}
      </span>
    </div>
  );
}

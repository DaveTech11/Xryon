import React from "react";
import { FileCode, Search, Code2, Sparkles, TerminalSquare } from "lucide-react";

const ITEMS = [
  { id: "files", label: "Files", icon: FileCode },
  { id: "search", label: "Search", icon: Search },
  { id: "editor", label: "Editor", icon: Code2 },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
];

export default function CodexMobileNav({ active, onChange, aiBusy }) {
  return (
    <nav
      className="codex-panel grid shrink-0 grid-cols-5"
      style={{ borderTop: "1px solid var(--codex-border)", paddingBottom: "var(--codex-safe-bottom)" }}
      aria-label="Codex sections"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="relative flex flex-col items-center justify-center gap-1 py-2.5"
            style={{ color: isActive ? "var(--codex-cyan)" : "var(--codex-text-faint)", minHeight: 48 }}
            aria-current={isActive ? "page" : undefined}
          >
            {isActive && <span className="absolute inset-x-3 top-0 h-0.5" style={{ background: "var(--codex-cyan)" }} />}
            <span className="relative">
              <Icon className="h-5 w-5" />
              {id === "ai" && aiBusy && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full codex-status-dot" style={{ background: "var(--codex-amber)" }} />}
            </span>
            <span className="text-[10px]">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

import React, { useState } from "react";
import { Send, Loader2, Square, Trash2, Paperclip, AlertCircle, CheckCircle2 } from "lucide-react";
import { AI_MODES, AI_QUICK_ACTIONS } from "./codexUtils";

export default function CodexAIPanel({
  activeFile, messages, thinking, phaseLabel,
  mode, onModeChange, onSend, onStop, onClear,
  diagnostics, onJumpToFile,
  width = 320,
}) {
  const [tab, setTab] = useState("chat"); // chat | diagnostics
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim() || thinking) return;
    onSend(input);
    setInput("");
  };

  const currentModeMeta = AI_MODES.find((m) => m.id === mode) || AI_MODES[0];

  return (
    <div className="codex-panel flex h-full flex-col overflow-hidden" style={{ width, borderLeft: "1px solid var(--codex-border)" }}>
      <div className="flex items-center gap-1 px-2 pt-2" style={{ borderBottom: "1px solid var(--codex-border)" }}>
        <button
          onClick={() => setTab("chat")}
          className={`px-2.5 py-2 text-[11px] font-semibold uppercase tracking-widest ${tab === "chat" ? "codex-active-edge text-white" : "text-[color:var(--codex-text-dim)] hover:text-white"}`}
        >
          AI Assistant
        </button>
        <button
          onClick={() => setTab("diagnostics")}
          className={`relative px-2.5 py-2 text-[11px] font-semibold uppercase tracking-widest ${tab === "diagnostics" ? "codex-active-edge text-white" : "text-[color:var(--codex-text-dim)] hover:text-white"}`}
        >
          Diagnostics
          {diagnostics?.length > 0 && (
            <span className="ml-1 rounded-full bg-[color:var(--codex-red)]/20 px-1.5 py-0 text-[9px] text-[color:var(--codex-red)]">{diagnostics.length}</span>
          )}
        </button>
        <button onClick={onClear} title="Clear conversation" aria-label="Clear conversation" className="ml-auto mb-1 text-[color:var(--codex-text-faint)] hover:text-white">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {tab === "chat" ? (
        <>
          {/* Mode tabs */}
          <div className="codex-scroll flex shrink-0 gap-1 overflow-x-auto px-2 py-2" style={{ borderBottom: "1px solid var(--codex-border)" }}>
            {AI_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => onModeChange(m.id)}
                title={m.hint}
                className={`shrink-0 border px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide ${
                  mode === m.id
                    ? "border-[color:var(--codex-cyan)] text-[color:var(--codex-cyan)]"
                    : "border-[color:var(--codex-border)] text-[color:var(--codex-text-dim)] hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Quick actions */}
          <div className="codex-scroll flex shrink-0 gap-1.5 overflow-x-auto px-2 py-2" style={{ borderBottom: "1px solid var(--codex-border)" }}>
            {AI_QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.id}
                disabled={!activeFile || thinking}
                onClick={() => onSend(qa.prompt)}
                className="shrink-0 border border-[color:var(--codex-border)] px-2 py-1 text-[10.5px] text-[color:var(--codex-text-dim)] hover:border-[color:var(--codex-cyan)] hover:text-white disabled:opacity-30"
              >
                {qa.label}
              </button>
            ))}
          </div>

          {activeFile && (
            <div className="codex-mono flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[10.5px] text-[color:var(--codex-text-faint)]" style={{ borderBottom: "1px solid var(--codex-border)" }}>
              <Paperclip className="h-3 w-3" /> {activeFile.name}
            </div>
          )}

          <div className="codex-scroll flex-1 space-y-2.5 overflow-auto p-3">
            {messages.length === 0 && (
              <p className="text-xs text-[color:var(--codex-text-faint)]">
                {currentModeMeta.hint} Responses update the open file automatically, with a live coding animation.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className="px-3 py-2 text-xs"
                style={{
                  background: m.role === "user" ? "rgba(167,139,250,0.08)" : "rgba(255,255,255,0.03)",
                  color: m.role === "user" ? "#d7cdfb" : "var(--codex-text-dim)",
                  border: "1px solid var(--codex-border)",
                }}
              >
                {m.content}
              </div>
            ))}
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-[color:var(--codex-text-faint)]">
                <Loader2 className="h-3 w-3 animate-spin" /> {phaseLabel || "Thinking…"}
              </div>
            )}
          </div>

          <div className="p-2.5" style={{ borderTop: "1px solid var(--codex-border)" }}>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                rows={2}
                placeholder={`${currentModeMeta.label}: ask the AI to code something… (Enter to send)`}
                className="codex-mono flex-1 resize-none border border-[color:var(--codex-border)] bg-black/30 p-2 text-xs text-[color:var(--codex-text)] outline-none placeholder:text-[color:var(--codex-text-faint)]"
              />
              {thinking ? (
                <button onClick={onStop} className="border border-[color:var(--codex-red)] p-2 text-[color:var(--codex-red)] hover:bg-[color:var(--codex-red)]/10" title="Stop generation" aria-label="Stop generation">
                  <Square className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button onClick={send} disabled={!input.trim()} className="p-2 disabled:opacity-40" style={{ background: "var(--codex-violet)", color: "#0a0a0f" }} title="Send (Enter)" aria-label="Send">
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-[color:var(--codex-text-faint)]">⌘/Ctrl+K to focus · Enter to send · Shift+Enter for a new line</p>
          </div>
        </>
      ) : (
        <div className="codex-scroll flex-1 overflow-auto p-2">
          {(!diagnostics || diagnostics.length === 0) ? (
            <div className="flex items-center gap-2 p-3 text-xs text-[color:var(--codex-green)]">
              <CheckCircle2 className="h-3.5 w-3.5" /> No errors detected across open files.
            </div>
          ) : (
            <div className="space-y-1">
              {diagnostics.map((d) => (
                <button
                  key={d.file.id}
                  onClick={() => onJumpToFile(d.file)}
                  className="flex w-full items-start gap-2 border border-[color:var(--codex-border)] px-2.5 py-2 text-left text-xs hover:border-[color:var(--codex-red)]/50"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--codex-red)]" />
                  <span>
                    <span className="codex-mono block text-[color:var(--codex-text)]">{d.file.name}</span>
                    <span className="block text-[color:var(--codex-text-dim)]">{d.error}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

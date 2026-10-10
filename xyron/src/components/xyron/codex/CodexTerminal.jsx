import React, { useEffect, useRef, useState } from "react";
import { Plus, X, Trash2, RotateCcw, Copy, TerminalSquare } from "lucide-react";

let sessionSeq = 1;
function newSession() {
  return {
    id: sessionSeq++,
    name: `bash ${sessionSeq - 1}`,
    lines: [{ type: "out", text: "Xyron Codex terminal — type `help` for available commands." }],
    history: [],
  };
}

function runJs(code) {
  const logs = [];
  const fakeConsole = {
    log: (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")),
    error: (...a) => logs.push("Error: " + a.map(String).join(" ")),
    warn: (...a) => logs.push("Warning: " + a.map(String).join(" ")),
  };
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("console", code);
    fn(fakeConsole);
    return { ok: true, output: logs.length ? logs.join("\n") : "(no output)" };
  } catch (e) {
    return { ok: false, output: (logs.length ? logs.join("\n") + "\n" : "") + e.message };
  }
}

export default function CodexTerminal({ files, activeFile, onOpenFile, onClose, height = 220 }) {
  const [sessions, setSessions] = useState(() => [newSession()]);
  const [activeId, setActiveId] = useState(() => sessions[0].id);
  const [input, setInput] = useState("");
  const [historyPointer, setHistoryPointer] = useState(-1);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const active = sessions.find((s) => s.id === activeId) || sessions[0];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sessions]);

  const pushLine = (id, line) =>
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, lines: [...s.lines, line] } : s)));

  const addSession = () => {
    const s = newSession();
    setSessions((prev) => [...prev, s]);
    setActiveId(s.id);
  };
  const closeSession = (id) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const fresh = newSession();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  };
  const clearSession = (id) => setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, lines: [] } : s)));
  const restartSession = (id) => setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, lines: newSession().lines, history: [] } : s)));

  const copyOutput = () => {
    const text = active.lines.map((l) => l.text).join("\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const exec = (raw) => {
    const cmd = raw.trim();
    if (!cmd) return;
    pushLine(active.id, { type: "in", text: cmd });
    setSessions((prev) => prev.map((s) => (s.id === active.id ? { ...s, history: [...s.history, cmd] } : s)));

    const [name, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(" ");

    if (name === "help") {
      pushLine(active.id, {
        type: "out",
        text: "Commands: help, clear, ls, cat <file>, open <file>, run, echo <text>\nrun executes the active file when it is JavaScript or JSON — other languages can't execute in a browser sandbox.",
      });
    } else if (name === "clear") {
      clearSession(active.id);
    } else if (name === "ls") {
      pushLine(active.id, { type: "out", text: files.length ? files.map((f) => f.name).join("\n") : "(no files)" });
    } else if (name === "cat") {
      const f = files.find((x) => x.name === arg);
      pushLine(active.id, f ? { type: "out", text: f.content || "(empty)" } : { type: "err", text: `cat: ${arg}: no such file` });
    } else if (name === "open") {
      const f = files.find((x) => x.name === arg);
      if (f) { onOpenFile(f); pushLine(active.id, { type: "out", text: `Opened ${arg} in the editor.` }); }
      else pushLine(active.id, { type: "err", text: `open: ${arg}: no such file` });
    } else if (name === "run") {
      if (!activeFile) { pushLine(active.id, { type: "err", text: "run: no active file" }); return; }
      if (activeFile.language === "javascript") {
        const res = runJs(activeFile.content || "");
        pushLine(active.id, { type: res.ok ? "out" : "err", text: res.output });
      } else if (activeFile.language === "json") {
        try { JSON.parse(activeFile.content || ""); pushLine(active.id, { type: "out", text: "Valid JSON." }); }
        catch (e) { pushLine(active.id, { type: "err", text: e.message }); }
      } else {
        pushLine(active.id, { type: "err", text: `run: in-browser execution isn't available for "${activeFile.language}". Download the file and run it locally.` });
      }
    } else if (name === "echo") {
      pushLine(active.id, { type: "out", text: arg });
    } else {
      pushLine(active.id, { type: "err", text: `${name}: command not found (try "help")` });
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      exec(input);
      setInput("");
      setHistoryPointer(-1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = active.history;
      if (!h.length) return;
      const next = Math.min(h.length - 1, historyPointer + 1);
      setHistoryPointer(next);
      setInput(h[h.length - 1 - next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const h = active.history;
      const next = historyPointer - 1;
      setHistoryPointer(next);
      setInput(next >= 0 ? h[h.length - 1 - next] : "");
    }
  };

  return (
    <div className="codex-panel flex flex-col overflow-hidden" style={{ height, borderTop: "1px solid var(--codex-border)" }} onClick={() => inputRef.current?.focus()}>
      <div className="flex shrink-0 items-center gap-1 px-2 pt-1.5" style={{ borderBottom: "1px solid var(--codex-border)" }}>
        <TerminalSquare className="mr-1 h-3.5 w-3.5 shrink-0 text-[color:var(--codex-text-faint)]" />
        <div className="codex-scroll flex flex-1 items-center gap-1 overflow-x-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={(e) => { e.stopPropagation(); setActiveId(s.id); }}
              style={{ borderTop: s.id === activeId ? "2px solid var(--codex-cyan)" : "2px solid transparent" }}
              className={`codex-mono group flex shrink-0 cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px] ${s.id === activeId ? "text-white" : "text-[color:var(--codex-text-dim)] hover:bg-white/5"}`}
            >
              {s.name}
              <button onClick={(e) => { e.stopPropagation(); closeSession(s.id); }} className="text-[color:var(--codex-text-faint)] opacity-0 hover:text-white group-hover:opacity-100" aria-label={`Close ${s.name}`}>
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={(e) => { e.stopPropagation(); addSession(); }} title="New terminal" aria-label="New terminal" className="grid h-6 w-6 shrink-0 place-items-center text-[color:var(--codex-text-dim)] hover:text-white"><Plus className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); restartSession(active.id); }} title="Restart terminal" aria-label="Restart terminal" className="grid h-6 w-6 shrink-0 place-items-center text-[color:var(--codex-text-dim)] hover:text-white"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); copyOutput(); }} title="Copy output" aria-label="Copy output" className="grid h-6 w-6 shrink-0 place-items-center text-[color:var(--codex-text-dim)] hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); clearSession(active.id); }} title="Clear" aria-label="Clear terminal" className="grid h-6 w-6 shrink-0 place-items-center text-[color:var(--codex-text-dim)] hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>
        {onClose && (
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close panel" aria-label="Close terminal panel" className="grid h-6 w-6 shrink-0 place-items-center text-[color:var(--codex-text-dim)] hover:text-white"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div ref={scrollRef} className="codex-scroll codex-mono flex-1 overflow-auto px-3 py-2 text-[12.5px] leading-relaxed">
        {active.lines.map((l, i) => (
          <div key={i} style={{ color: l.type === "err" ? "var(--codex-red)" : l.type === "in" ? "var(--codex-cyan)" : "var(--codex-text-dim)", whiteSpace: "pre-wrap" }}>
            {l.type === "in" ? `$ ${l.text}` : l.text}
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span style={{ color: "var(--codex-cyan)" }}>$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            className="codex-mono flex-1 bg-transparent text-[color:var(--codex-text)] outline-none"
            aria-label="Terminal command input"
          />
          <span className="codex-caret" style={{ color: "var(--codex-text)" }}>▍</span>
        </div>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  Menu, FileCode, Download, Rocket, Zap, CheckCircle2, X, ChevronDown,
  Columns2, Lock, Command as CommandIcon, Loader2,
} from "lucide-react";

import { api } from "../api/client";
import { XYRON_RESPONSE_STYLE_PROMPT } from "../lib/persona";
import { checkPremium, getCurrentUser, getSetting, setSetting } from "../lib/settings";
import { isAdminUser } from "../lib/adminEmails";
import Sidebar from "../components/xyron/Sidebar";
import CodexComingSoon from "../components/xyron/CodexComingSoon";

import CodexSidebar from "../components/xyron/codex/CodexSidebar";
import CodexEditor from "../components/xyron/codex/CodexEditor";
import CodexAIPanel from "../components/xyron/codex/CodexAIPanel";
import CodexTerminal from "../components/xyron/codex/CodexTerminal";
import CodexStatusBar from "../components/xyron/codex/CodexStatusBar";
import CodexMobileNav from "../components/xyron/codex/CodexMobileNav";
import { CodexCommandPalette, CodexQuickOpen, CodexConfirmDialog } from "../components/xyron/codex/CodexOverlays";
import { LANGUAGES, MODELS, detectError, useCodexBreakpoint } from "../components/xyron/codex/codexUtils";
import "../styles/codex-theme.css";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MODE_PREFIX = {
  ask: "",
  edit: "Make exactly this change to the file: ",
  fix: "Fix this issue in the file: ",
  explain: "Explain the following about the file: ",
  review: "Review the file for the following, and fix what you find: ",
  agent: "Acting as an autonomous coding agent, plan the steps then carry out: ",
};

export default function Codex() {
  const navigate = useNavigate();
  const bp = useCodexBreakpoint(); // "mobile" | "tablet" | "laptop" | "desktop"
  const isMobile = bp === "mobile";
  const isTablet = bp === "tablet";

  // ---- Files & tabs ----
  const [files, setFiles] = useState([]);
  const [savedSnapshots, setSavedSnapshots] = useState({});
  const [activeFileId, setActiveFileId] = useState(null);
  const [secondaryFileId, setSecondaryFileId] = useState(null);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [openTabs, setOpenTabs] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);

  // ---- Layout / chrome ----
  const [sidebarOpen, setSidebarOpen] = useState(false); // app-level nav drawer
  const [explorerView, setExplorerView] = useState("explorer"); // "explorer" | "search"
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [mobileView, setMobileView] = useState("files"); // files | search | editor | ai | terminal
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickOpenOpen, setQuickOpenOpen] = useState(false);
  const [caret, setCaret] = useState({ line: 1, column: 1 });

  // ---- Access gate ----
  const [access, setAccess] = useState("checking"); // "checking" | "locked" | "granted"

  // ---- AI ----
  const [isPremium, setIsPremium] = useState(false);
  const [aiMode, setAiMode] = useState("ask");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [showSubModal, setShowSubModal] = useState(false);
  const [vortyxThinking, setVortyxThinking] = useState(false);
  const [vortyxStatus, setVortyxStatus] = useState(null);
  const [showCodexIntro, setShowCodexIntro] = useState(getSetting("codexIntroSeen", "false") !== "true");
  const [model, setModel] = useState(getSetting("codexModel", "vortyx_pulse"));
  const [modelOpen, setModelOpen] = useState(false);
  const [autoFixEnabled, setAutoFixEnabled] = useState(getSetting("autoFix", "on") === "on");
  const [phase, setPhase] = useState(null); // null | thinking | writing | checking | error | fixing | success

  const vortyxTimer = useRef(null);
  const animTokenRef = useRef(0);
  const stopRef = useRef(false);

  const activeFile = useMemo(() => files.find((f) => f.id === activeFileId) || null, [files, activeFileId]);
  const secondaryFile = useMemo(() => files.find((f) => f.id === secondaryFileId) || null, [files, secondaryFileId]);
  const openFileObjs = useMemo(() => openTabs.map((id) => files.find((f) => f.id === id)).filter(Boolean), [openTabs, files]);
  const currentModel = MODELS.find((m) => m.id === model) || MODELS[0];
  const currentError = activeFile ? detectError(activeFile.content, activeFile.language) : null;

  const dirtyIds = useMemo(() => {
    const set = new Set();
    for (const f of files) {
      if (savedSnapshots[f.id] !== undefined && f.content !== savedSnapshots[f.id]) set.add(f.id);
    }
    return set;
  }, [files, savedSnapshots]);

  const diagnostics = useMemo(
    () => files.map((f) => ({ file: f, error: detectError(f.content, f.language) })).filter((d) => d.error),
    [files]
  );
  const errorCounts = useMemo(() => Object.fromEntries(diagnostics.map((d) => [d.file.id, true])), [diagnostics]);

  // ---------------------------------------------------------------------
  // Loading & persistence
  // ---------------------------------------------------------------------
  useEffect(() => {
    Promise.all([checkPremium(), getCurrentUser()]).then(([premium, user]) => {
      setIsPremium(premium);
      // Codex is admin-only for now; everyone else sees "Coming Soon".
      setAccess(isAdminUser(user) ? "granted" : "locked");
    });
  }, []);

  useEffect(() => {
    if (access === "granted") loadFiles();
  }, [access]);

  const loadFiles = async () => {
    try {
      const list = await api.entities.CodeFile.list();
      setFiles(list);
      setSavedSnapshots(Object.fromEntries(list.map((f) => [f.id, f.content || ""])));
      if (list.length > 0) {
        setActiveFileId((current) => current || list[0].id);
        setOpenTabs((current) => (current.length ? current : [list[0].id]));
      }
    } catch (error) {
      setVortyxStatus(`Could not load files: ${error.message}`);
    }
  };

  const openFile = (f) => {
    setActiveFileId(f.id);
    setOpenTabs((prev) => (prev.includes(f.id) ? prev : [...prev, f.id]));
    if (isMobile) setMobileView("editor");
  };

  const closeTab = (id) => {
    setOpenTabs((prev) => {
      const next = prev.filter((x) => x !== id);
      if (activeFileId === id) setActiveFileId(next[next.length - 1] || null);
      return next;
    });
    if (secondaryFileId === id) setSecondaryFileId(null);
  };

  const createFile = async (nameHint) => {
    const name = nameHint || `untitled-${files.length + 1}.js`;
    const file = await api.entities.CodeFile.create({ name, language: "javascript", content: "", project: "untitled" });
    setFiles((prev) => [file, ...prev]);
    setSavedSnapshots((prev) => ({ ...prev, [file.id]: "" }));
    setActiveFileId(file.id);
    setOpenTabs((prev) => [...prev, file.id]);
    if (isMobile) setMobileView("editor");
  };

  const createFolder = async () => {
    const name = window.prompt("New folder name");
    if (!name || !name.trim()) return;
    await createFile(`${name.trim().replace(/\/$/, "")}/index.js`);
  };

  const duplicateFile = async (file) => {
    const parts = file.name.split(".");
    const ext = parts.length > 1 ? "." + parts.pop() : "";
    const copyName = `${parts.join(".")}-copy${ext}`;
    const copy = await api.entities.CodeFile.create({ name: copyName, language: file.language, content: file.content, project: file.project });
    setFiles((prev) => [copy, ...prev]);
    setSavedSnapshots((prev) => ({ ...prev, [copy.id]: copy.content || "" }));
    openFile(copy);
  };

  const renameFile = async (file, newName) => {
    const updated = await api.entities.CodeFile.update(file.id, { name: newName });
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, ...updated, name: newName } : f)));
  };

  const requestDelete = (file) => setPendingDelete(file);
  const confirmDelete = async () => {
    const file = pendingDelete;
    if (!file) return;
    setPendingDelete(null);
    await api.entities.CodeFile.delete(file.id);
    const remaining = files.filter((f) => f.id !== file.id);
    setFiles(remaining);
    setSavedSnapshots((prev) => { const next = { ...prev }; delete next[file.id]; return next; });
    setOpenTabs((prev) => prev.filter((x) => x !== file.id));
    if (activeFileId === file.id) {
      setActiveFileId(remaining[0]?.id || null);
      if (isMobile) setMobileView("files");
    }
  };

  const writeToFile = (fileId, content) => setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, content } : f)));
  const updateContent = (content) => activeFile && writeToFile(activeFile.id, content);
  const updateSecondaryContent = (content) => secondaryFile && writeToFile(secondaryFile.id, content);

  const saveFile = async () => {
    if (!activeFile) return;
    await api.entities.CodeFile.update(activeFile.id, { content: activeFile.content, name: activeFile.name, language: activeFile.language });
    setSavedSnapshots((prev) => ({ ...prev, [activeFile.id]: activeFile.content }));
    setVortyxStatus("Saved.");
  };

  // ---------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event) => {
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (meta && key === "s") { event.preventDefault(); saveFile(); }
      else if (meta && event.shiftKey && key === "p") { event.preventDefault(); setCommandPaletteOpen(true); }
      else if (meta && key === "p") { event.preventDefault(); setQuickOpenOpen(true); }
      else if (meta && key === "k") { event.preventDefault(); if (isMobile) setMobileView("ai"); else setAiPanelOpen(true); }
      else if (event.key === "Escape") { setCommandPaletteOpen(false); setQuickOpenOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeFile, isMobile]);

  // ---------------------------------------------------------------------
  // Vortyx Pulse auto-fix
  // ---------------------------------------------------------------------
  const runVortyxPulse = useCallback(async (code, language, error) => {
    if (!code || !error) return;
    setVortyxThinking(true);
    setPhase("fixing");
    setVortyxStatus("Vortyx Pulse detected an error. Auto-fixing…");
    try {
      const res = await api.functions.invoke("vortyxFix", { code, language, error });
      const fixed = res.data?.fixed_code;
      if (fixed) {
        updateContent(fixed);
        setVortyxStatus("Vortyx Pulse fixed the error automatically.");
        setPhase("success");
        setTimeout(() => setPhase((p) => (p === "success" ? null : p)), 1300);
      } else {
        setVortyxStatus("Vortyx Pulse could not fix the error.");
        setPhase(null);
      }
    } catch (e) {
      setVortyxStatus("Vortyx Pulse error: " + e.message);
      setPhase(null);
    }
    setVortyxThinking(false);
  }, [activeFile]);

  useEffect(() => {
    if (!autoFixEnabled || !activeFile || !currentError) return;
    clearTimeout(vortyxTimer.current);
    vortyxTimer.current = setTimeout(() => {
      runVortyxPulse(activeFile.content, activeFile.language, currentError);
    }, 2500);
    return () => clearTimeout(vortyxTimer.current);
  }, [currentError, autoFixEnabled, activeFile?.id]);

  // Typewriter-style animated write, used for the "AI is coding" effect.
  const animateType = (fileId, fullText) => {
    const token = ++animTokenRef.current;
    return new Promise((resolve) => {
      let i = 0;
      const total = fullText.length;
      const chunk = Math.max(3, Math.round(total / 160));
      const step = () => {
        if (animTokenRef.current !== token) return resolve();
        i = Math.min(total, i + chunk);
        writeToFile(fileId, fullText.slice(0, i));
        if (i < total) setTimeout(step, 12);
        else resolve();
      };
      step();
    });
  };

  const ensureTargetFile = async () => {
    if (activeFile) return activeFile;
    const name = `ai-build-${files.length + 1}.js`;
    const file = await api.entities.CodeFile.create({ name, language: "javascript", content: "", project: "untitled" });
    setFiles((prev) => [file, ...prev]);
    setSavedSnapshots((prev) => ({ ...prev, [file.id]: "" }));
    setActiveFileId(file.id);
    setOpenTabs((prev) => [...prev, file.id]);
    return file;
  };

  // Shared AI coding flow used by the AI panel, quick actions and mobile.
  const runAICodingFlow = async (prompt) => {
    if (!prompt.trim() || aiThinking) return;
    if (!currentModel.free && !isPremium) { setShowSubModal(true); return; }
    stopRef.current = false;
    const target = await ensureTargetFile();
    const framed = `${MODE_PREFIX[aiMode] || ""}${prompt}`;
    setAiMessages((prev) => [...prev, { role: "user", content: prompt }]);
    setAiThinking(true);
    setPhase("thinking");
    try {
      const res = await api.functions.invoke("xryonChat", {
        messages: [
          { role: "user", content: `Here is my code file "${target.name}" (${target.language}):\n\n${target.content}\n\nUser request: ${framed}\n\nRespond with the updated code in a single code block, plus a brief explanation.` },
        ],
        persona: "professional",
        system_prompt: XYRON_RESPONSE_STYLE_PROMPT,
        model,
      });
      if (stopRef.current) { setAiThinking(false); setPhase(null); return; }
      const reply = res.data?.reply || "Something went wrong.";
      setAiMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      const codeMatch = reply.match(/```\w*\n?([\s\S]*?)```/);
      if (codeMatch) {
        const code = codeMatch[1].trim();
        setPhase("writing");
        await animateType(target.id, code);
        if (stopRef.current) { setAiThinking(false); setPhase(null); return; }
        setPhase("checking");
        await sleep(350);
        const err = detectError(code, target.language);
        if (err && !stopRef.current) {
          setPhase("error");
          await sleep(400);
          setPhase("fixing");
          setVortyxStatus("Vortyx Pulse detected an error. Auto-fixing…");
          try {
            const fixRes = await api.functions.invoke("vortyxFix", { code, language: target.language, error: err });
            const fixed = fixRes.data?.fixed_code;
            if (fixed && !stopRef.current) {
              await animateType(target.id, fixed);
              setVortyxStatus("Vortyx Pulse fixed the error automatically.");
            }
          } catch (e) {
            setVortyxStatus("Vortyx Pulse error: " + e.message);
          }
        }
        setPhase("success");
        setTimeout(() => setPhase((p) => (p === "success" ? null : p)), 1300);
      } else {
        setPhase(null);
      }
    } catch (e) {
      if (!stopRef.current) setAiMessages((prev) => [...prev, { role: "assistant", content: e.message }]);
      setPhase(null);
    }
    setAiThinking(false);
  };

  const stopAI = () => {
    stopRef.current = true;
    animTokenRef.current++;
    setAiThinking(false);
    setPhase(null);
    setVortyxStatus("Stopped.");
  };
  const clearAI = () => setAiMessages([]);

  const downloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = activeFile.name; a.click();
    URL.revokeObjectURL(url);
  };

  const deployFile = () => {
    if (!activeFile || !activeFile.content) return;
    const lang = activeFile.language;
    let blobContent = activeFile.content;
    let mimeType = "text/plain";
    if (lang === "html") mimeType = "text/html";
    else if (lang === "css") mimeType = "text/css";
    else if (["javascript", "jsx", "typescript"].includes(lang)) {
      blobContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${activeFile.name}</title></head><body><script>\n${activeFile.content}\n<\/script></body></html>`;
      mimeType = "text/html";
    }
    const blob = new Blob([blobContent], { type: mimeType });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const selectModel = (m) => {
    if (!m.free && !isPremium) { setModelOpen(false); setShowSubModal(true); return; }
    setModel(m.id); setSetting("codexModel", m.id); setModelOpen(false);
  };

  const dismissIntro = () => { setShowCodexIntro(false); setSetting("codexIntroSeen", true); };

  const phaseClass =
    phase === "writing" ? "xcode-anim-writing" : phase === "fixing" ? "xcode-anim-fixing" :
    phase === "error" ? "xcode-anim-error" : phase === "success" ? "xcode-anim-success" : "";
  const phaseLabel =
    phase === "thinking" ? "AI is thinking…" : phase === "writing" ? "AI is writing code…" :
    phase === "checking" ? "Checking for errors…" : phase === "fixing" ? "Fixing the error…" :
    phase === "success" ? "Done!" : null;

  // ---------------------------------------------------------------------
  // Command palette
  // ---------------------------------------------------------------------
  const paletteCommands = useMemo(() => [
    { id: "new-file", label: "New File", group: "Files", run: () => createFile() },
    { id: "new-folder", label: "New Folder", group: "Files", run: createFolder },
    { id: "save-file", label: "Save File", group: "Files", run: saveFile },
    { id: "download-file", label: "Download File", group: "Files", run: downloadFile },
    { id: "deploy-file", label: "Deploy to Live Preview", group: "Files", run: deployFile },
    { id: "duplicate-file", label: "Duplicate Active File", group: "Files", run: () => activeFile && duplicateFile(activeFile) },
    { id: "delete-file", label: "Delete Active File", group: "Files", run: () => activeFile && requestDelete(activeFile) },
    { id: "go-to-file", label: "Go to File…", group: "Navigate", run: () => setQuickOpenOpen(true) },
    { id: "toggle-explorer", label: "Toggle Explorer", group: "View", run: () => setExplorerOpen((v) => !v) },
    { id: "toggle-ai", label: "Toggle AI Assistant", group: "View", run: () => setAiPanelOpen((v) => !v) },
    { id: "toggle-terminal", label: "Toggle Terminal", group: "View", run: () => setTerminalOpen((v) => !v) },
    { id: "toggle-split", label: "Toggle Split Editor", group: "View", run: () => setSplitEnabled((v) => !v) },
    { id: "run-file", label: "Run Active File (open terminal, then type `run`)", group: "Run", run: () => setTerminalOpen(true) },
    { id: "toggle-autofix", label: `Turn Auto-fix ${autoFixEnabled ? "Off" : "On"}`, group: "AI", run: () => { setAutoFixEnabled((v) => !v); setSetting("autoFix", !autoFixEnabled ? "on" : "off"); } },
    { id: "open-settings", label: "Open Settings", group: "Navigate", run: () => navigate("/settings") },
  ], [activeFile, autoFixEnabled]);

  // ---------------------------------------------------------------------
  // Shared sub-views
  // ---------------------------------------------------------------------
  const renderAI = (width) => (
    <CodexAIPanel
      activeFile={activeFile}
      messages={aiMessages}
      thinking={aiThinking}
      phaseLabel={phaseLabel}
      mode={aiMode}
      onModeChange={setAiMode}
      onSend={runAICodingFlow}
      onStop={stopAI}
      onClear={clearAI}
      diagnostics={diagnostics}
      onJumpToFile={openFile}
      width={width}
    />
  );

  const renderTerminal = (height) => (
    <CodexTerminal
      files={files}
      activeFile={activeFile}
      onOpenFile={openFile}
      onClose={() => setTerminalOpen(false)}
      height={height}
    />
  );

  const fileToolbar = activeFile && (
    <header className="flex flex-wrap items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--codex-border)", background: "var(--codex-bg-raised)" }}>
      <input
        value={activeFile.name}
        onChange={(e) => setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, name: e.target.value } : f)))}
        onBlur={(e) => renameFile(activeFile, e.target.value)}
        className="codex-mono min-w-0 flex-1 bg-transparent text-sm font-medium text-[color:var(--codex-text)] outline-none"
      />
      <select
        value={activeFile.language}
        onChange={(e) => setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, language: e.target.value } : f)))}
        className="border border-[color:var(--codex-border)] bg-black/30 px-2 py-1 text-xs text-[color:var(--codex-text-dim)] outline-none"
      >
        {LANGUAGES.map((l) => <option key={l} value={l} style={{ background: "#0a0a0f" }}>{l}</option>)}
      </select>

      {!isMobile && !isTablet && (
        <div className="relative">
          <button onClick={() => setModelOpen(!modelOpen)} className="flex items-center gap-1.5 border border-[color:var(--codex-border)] px-2.5 py-1.5 text-xs text-[color:var(--codex-text-dim)] hover:text-white">
            <Zap className="h-3 w-3" style={{ color: "var(--codex-amber)" }} />
            <span className="max-w-[90px] truncate">{currentModel.name}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          {modelOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setModelOpen(false)} />
              <div className="codex-panel absolute right-0 top-9 z-50 w-56 py-1 shadow-xl">
                <p className="px-3 py-1.5 text-[10px] uppercase tracking-widest text-[color:var(--codex-text-faint)]">Switch model</p>
                {MODELS.map((m) => (
                  <button key={m.id} onClick={() => selectModel(m)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[color:var(--codex-text)]">{m.name}</span>
                        {!m.free && <Lock className="h-2.5 w-2.5" style={{ color: "var(--codex-violet)" }} />}
                      </div>
                      <p className="text-[10px] text-[color:var(--codex-text-faint)]">{m.desc}</p>
                    </div>
                    {model === m.id && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--codex-green)" }} />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {!isMobile && (
          <button onClick={() => setSplitEnabled((v) => !v)} title="Split editor" aria-label="Split editor" className="grid h-8 w-8 place-items-center border" style={{ borderColor: splitEnabled ? "var(--codex-cyan)" : "var(--codex-border)", color: splitEnabled ? "var(--codex-cyan)" : "var(--codex-text-dim)" }}>
            <Columns2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={deployFile} disabled={!activeFile.content} className="flex items-center gap-1.5 border border-[color:var(--codex-border)] px-2.5 py-1.5 text-xs disabled:opacity-30" style={{ color: "var(--codex-green)" }} title="Deploy to live preview">
          <Rocket className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Deploy</span>
        </button>
        <button onClick={downloadFile} className="flex items-center gap-1.5 border border-[color:var(--codex-border)] px-2.5 py-1.5 text-xs text-[color:var(--codex-text-dim)] hover:text-white" title="Download file">
          <Download className="h-3.5 w-3.5" /> <span className="hidden lg:inline">Download</span>
        </button>
        <button onClick={saveFile} className="px-3 py-1.5 text-xs font-medium" style={{ background: "var(--codex-cyan)", color: "#031014" }}>Save</button>
      </div>
    </header>
  );

  const editorArea = (
    <div className="flex h-full flex-col overflow-hidden">
      {fileToolbar}
      {vortyxThinking && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs" style={{ borderBottom: "1px solid var(--codex-border)", color: "var(--codex-amber)" }}>
          <Zap className="h-3.5 w-3.5 animate-pulse" /> Vortyx Pulse is analyzing…
        </div>
      )}
      <div className="min-h-0 flex-1">
        {activeFile ? (
          <CodexEditor
            openFiles={openFileObjs}
            activeFile={activeFile}
            dirtyIds={dirtyIds}
            onSelectTab={(id) => setActiveFileId(id)}
            onCloseTab={closeTab}
            onChangeContent={updateContent}
            phaseClass={phaseClass}
            phaseLabel={phaseLabel}
            phase={phase}
            splitEnabled={splitEnabled}
            secondaryFile={secondaryFile}
            onChangeSecondaryContent={updateSecondaryContent}
            onCaretChange={(line, column) => setCaret({ line, column })}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-5 codex-bg-grid">
            <div className="grid h-16 w-16 place-items-center border border-[color:var(--codex-border)]">
              <FileCode className="h-8 w-8" style={{ color: "var(--codex-text-faint)" }} />
            </div>
            <p className="text-sm text-[color:var(--codex-text-dim)]">Create a file to start coding</p>
            <button onClick={() => createFile()} className="px-4 py-2 text-sm font-medium" style={{ background: "var(--codex-cyan)", color: "#031014" }}>New File</button>
          </div>
        )}
      </div>
    </div>
  );

  const sidebarPanel = (widthPx) => (
    <CodexSidebar
      view={explorerView}
      onChangeView={setExplorerView}
      files={files}
      activeFile={activeFile}
      dirtyIds={dirtyIds}
      errorCounts={errorCounts}
      onOpen={openFile}
      onCreateFile={() => createFile()}
      onCreateFolder={createFolder}
      onRename={renameFile}
      onDuplicate={duplicateFile}
      onDelete={requestDelete}
      aiPanelOpen={aiPanelOpen}
      onToggleAi={() => setAiPanelOpen((v) => !v)}
      terminalOpen={terminalOpen}
      onToggleTerminal={() => setTerminalOpen((v) => !v)}
      width={widthPx}
    />
  );

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (access === "checking") {
    return (
      <div className="codex-root codex-no-h-scroll flex min-h-screen items-center justify-center md:pl-72">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--codex-cyan)" }} />
      </div>
    );
  }

  if (access === "locked") {
    return (
      <div className="min-h-screen bg-[#08080a]">
        <CodexComingSoon onClose={() => navigate("/")} />
      </div>
    );
  }

  return (
    <div className="codex-root codex-no-h-scroll min-h-screen md:pl-72" style={{ paddingTop: "var(--codex-safe-top)" }}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <CodexCommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} commands={paletteCommands} />
      <CodexQuickOpen open={quickOpenOpen} onClose={() => setQuickOpenOpen(false)} files={files} onPick={openFile} />
      <CodexConfirmDialog
        open={!!pendingDelete}
        title="Delete file"
        description={pendingDelete ? `"${pendingDelete.name}" will be permanently deleted. This can't be undone.` : ""}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Top bar */}
      <div className="flex h-11 shrink-0 items-center gap-2 px-2" style={{ borderBottom: "1px solid var(--codex-border)", background: "var(--codex-bg-raised)" }}>
        <button onClick={() => setSidebarOpen(true)} className="grid h-8 w-8 place-items-center text-[color:var(--codex-text-dim)] hover:text-white" aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </button>
        <span className="codex-mono text-xs font-semibold tracking-[0.2em]" style={{ color: "var(--codex-cyan)" }}>XYRON CODEX</span>
        <div className="mx-2 hidden h-4 w-px sm:block" style={{ background: "var(--codex-border)" }} />
        <button
          onClick={() => setQuickOpenOpen(true)}
          className="hidden items-center gap-2 border border-[color:var(--codex-border)] px-3 py-1 text-xs text-[color:var(--codex-text-faint)] hover:text-white sm:flex"
        >
          <CommandIcon className="h-3 w-3" /> Go to file <span className="codex-mono ml-2 opacity-60">Ctrl/⌘P</span>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {(isTablet) && (
            <button onClick={() => setExplorerOpen((v) => !v)} className="border border-[color:var(--codex-border)] px-2.5 py-1 text-xs text-[color:var(--codex-text-dim)] hover:text-white">Files</button>
          )}
          {(isTablet) && (
            <button onClick={() => setAiPanelOpen((v) => !v)} className="border px-2.5 py-1 text-xs" style={{ borderColor: aiPanelOpen ? "var(--codex-cyan)" : "var(--codex-border)", color: aiPanelOpen ? "var(--codex-cyan)" : "var(--codex-text-dim)" }}>AI</button>
          )}
          <button onClick={() => setTerminalOpen((v) => !v)} className="hidden border px-2.5 py-1 text-xs sm:block" style={{ borderColor: terminalOpen ? "var(--codex-cyan)" : "var(--codex-border)", color: terminalOpen ? "var(--codex-cyan)" : "var(--codex-text-dim)" }}>Terminal</button>
          <button onClick={() => setCommandPaletteOpen(true)} className="grid h-8 w-8 place-items-center text-[color:var(--codex-text-dim)] hover:text-white" aria-label="Command palette" title="Command palette (Ctrl/⌘+Shift+P)">
            <CommandIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ===================== MOBILE ===================== */}
      {isMobile && (
        <div className="flex flex-col" style={{ height: "calc(100dvh - 44px)" }}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {mobileView === "files" && (
              <div className="flex-1 overflow-hidden">
                {sidebarPanel("100%")}
              </div>
            )}
            {mobileView === "search" && (
              <div className="flex-1 overflow-hidden">
                <CodexSidebar
                  view="search" onChangeView={() => {}} files={files} activeFile={activeFile} dirtyIds={dirtyIds} errorCounts={errorCounts}
                  onOpen={openFile} onCreateFile={() => createFile()} onCreateFolder={createFolder} onRename={renameFile}
                  onDuplicate={duplicateFile} onDelete={requestDelete} aiPanelOpen={aiPanelOpen} onToggleAi={() => setAiPanelOpen((v) => !v)}
                  terminalOpen={terminalOpen} onToggleTerminal={() => setTerminalOpen((v) => !v)} width="100%"
                />
              </div>
            )}
            {mobileView === "editor" && <div className="min-h-0 flex-1">{editorArea}</div>}
            {mobileView === "ai" && <div className="min-h-0 flex-1">{renderAI("100%")}</div>}
            {mobileView === "terminal" && <div style={{ height: "60dvh" }}>{renderTerminal("100%")}</div>}
          </div>
          <CodexMobileNav active={mobileView} onChange={setMobileView} aiBusy={aiThinking} />
        </div>
      )}

      {/* ===================== TABLET ===================== */}
      {isTablet && (
        <div className="relative flex" style={{ height: "calc(100dvh - 44px)" }}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">{editorArea}</div>
            {terminalOpen && renderTerminal(220)}
            <CodexStatusBar activeFile={activeFile} errorCount={diagnostics.length} line={caret.line} column={caret.column} phaseLabel={phaseLabel} busy={aiThinking || vortyxThinking} />
          </div>
          {explorerOpen && (
            <div className="absolute inset-y-0 left-0 z-30 shadow-2xl">
              {sidebarPanel(280)}
            </div>
          )}
          {explorerOpen && <div className="absolute inset-0 z-20 bg-black/40" onClick={() => setExplorerOpen(false)} />}
          {aiPanelOpen && (
            <div className="absolute inset-y-0 right-0 z-30 shadow-2xl">
              {renderAI(340)}
            </div>
          )}
        </div>
      )}

      {/* ===================== LAPTOP / DESKTOP ===================== */}
      {!isMobile && !isTablet && (
        <PanelGroup direction="vertical" style={{ height: "calc(100dvh - 44px)" }}>
          <Panel defaultSize={terminalOpen ? 72 : 100} minSize={40}>
            <PanelGroup direction="horizontal" className="h-full">
              {explorerOpen && (
                <>
                  <Panel defaultSize={18} minSize={12} maxSize={32} order={1}>
                    {sidebarPanel("100%")}
                  </Panel>
                  <PanelResizeHandle className="codex-resize-handle" />
                </>
              )}
              <Panel minSize={30} order={2}>
                {editorArea}
              </Panel>
              {aiPanelOpen && (
                <>
                  <PanelResizeHandle className="codex-resize-handle" />
                  <Panel defaultSize={24} minSize={16} maxSize={40} order={3}>
                    {renderAI("100%")}
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
          {terminalOpen && (
            <>
              <PanelResizeHandle className="codex-resize-handle" />
              <Panel defaultSize={28} minSize={12} maxSize={60}>
                {renderTerminal("100%")}
              </Panel>
            </>
          )}
        </PanelGroup>
      )}
      {!isMobile && !isTablet && (
        <CodexStatusBar activeFile={activeFile} errorCount={diagnostics.length} line={caret.line} column={caret.column} phaseLabel={phaseLabel} busy={aiThinking || vortyxThinking} />
      )}

      {/* Codex intro modal */}
      {showCodexIntro && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="codex-panel w-full max-w-md overflow-hidden shadow-2xl">
            <div className="relative p-6 codex-grid-frame" style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.08), transparent)" }}>
              <button onClick={dismissIntro} className="absolute right-3 top-3 grid h-8 w-8 place-items-center border border-[color:var(--codex-border)] text-[color:var(--codex-text-dim)] hover:text-white">
                <X className="h-4 w-4" />
              </button>
              <div className="grid h-12 w-12 place-items-center border border-[color:var(--codex-border)]">
                <FileCode className="h-6 w-6" style={{ color: "var(--codex-cyan)" }} />
              </div>
              <h2 className="mt-4 font-display text-xl text-white">Build with Xyron Codex</h2>
            </div>
            <div className="p-6">
              <p className="text-sm text-[color:var(--codex-text-dim)]">
                A resizable explorer, editor and AI panel on laptop and desktop; a dedicated slide-over layout on tablet; and a full-screen, bottom-nav experience on phones. Ask the AI to build, fix or explain code — it edits your file live and auto-fixes errors.
              </p>
              <div className="mt-6 flex gap-3">
                <Link to="/artifacts" onClick={dismissIntro} className="flex-1 border border-[color:var(--codex-border)] px-4 py-2.5 text-center text-sm text-[color:var(--codex-text-dim)] hover:text-white">Learn more</Link>
                <button onClick={dismissIntro} className="flex-1 px-4 py-2.5 text-center text-sm font-medium" style={{ background: "var(--codex-cyan)", color: "#031014" }}>Continue</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription modal */}
      {showSubModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSubModal(false)}>
          <div className="codex-panel w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center border border-[color:var(--codex-border)]" style={{ color: "var(--codex-violet)" }}>
                <Lock className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg text-white">Premium Feature</h3>
            </div>
            <p className="text-sm text-[color:var(--codex-text-dim)]">This feature requires a premium subscription. Upgrade to unlock advanced models.</p>
            <div className="mt-5 flex gap-2">
              <Link to="/premium" className="flex-1 px-4 py-2.5 text-center text-sm font-medium text-white" style={{ background: "var(--codex-violet)" }}>Upgrade to Premium</Link>
              <button onClick={() => setShowSubModal(false)} className="border border-[color:var(--codex-border)] px-4 py-2.5 text-sm text-[color:var(--codex-text-dim)] hover:text-white">Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

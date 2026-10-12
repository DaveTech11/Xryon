import { useEffect, useState } from "react";

export const LANGUAGES = ["javascript", "python", "html", "css", "json", "typescript", "jsx", "bash"];

export const MODELS = [
  { id: "vortyx_pulse", name: "Xyron Pulse", desc: "Auto-fix intelligence", free: true },
  { id: "gpt_5_mini", name: "Xyron Swift", desc: "Fast everyday intelligence", free: true },
  { id: "claude_sonnet_4_6", name: "Xyron Nexus", desc: "Advanced reasoning", free: false },
  { id: "gpt_5_6_luna", name: "Xyron Luna", desc: "Premium reasoning intelligence", free: false },
  { id: "gemini_3_1_pro", name: "Xyron Vision", desc: "Advanced multimodal intelligence", free: false },
];

export const AI_MODES = [
  { id: "ask", label: "Ask", hint: "Answer questions about the project or a snippet." },
  { id: "edit", label: "Edit", hint: "Make a targeted change to the open file." },
  { id: "fix", label: "Fix", hint: "Diagnose and fix the current error." },
  { id: "explain", label: "Explain", hint: "Explain what the code does, plainly." },
  { id: "review", label: "Review", hint: "Review for bugs, security and readability." },
  { id: "agent", label: "Agent", hint: "Plan then carry out a multi-step change." },
];

export const AI_QUICK_ACTIONS = [
  { id: "fix", label: "Fix", prompt: "Fix any bugs or errors in this file." },
  { id: "explain", label: "Explain", prompt: "Explain what this file does, in plain language." },
  { id: "refactor", label: "Refactor", prompt: "Refactor this file for clarity and maintainability without changing behavior." },
  { id: "test", label: "Test", prompt: "Write tests that cover this file's important behavior." },
  { id: "review", label: "Review", prompt: "Review this file for bugs, security issues and readability." },
  { id: "optimize", label: "Optimize", prompt: "Optimize this file for performance and explain the trade-offs." },
  { id: "document", label: "Document", prompt: "Add clear documentation and comments to this file." },
  { id: "security", label: "Security scan", prompt: "Scan this file for security issues and list them by severity." },
];

export const EXT_COLORS = {
  js: { dot: "bg-amber-400", soft: "bg-amber-400/10" },
  jsx: { dot: "bg-cyan-400", soft: "bg-cyan-400/10" },
  ts: { dot: "bg-blue-400", soft: "bg-blue-400/10" },
  tsx: { dot: "bg-blue-300", soft: "bg-blue-300/10" },
  json: { dot: "bg-yellow-500", soft: "bg-yellow-500/10" },
  html: { dot: "bg-orange-400", soft: "bg-orange-400/10" },
  css: { dot: "bg-sky-400", soft: "bg-sky-400/10" },
  py: { dot: "bg-emerald-400", soft: "bg-emerald-400/10" },
  md: { dot: "bg-neutral-400", soft: "bg-neutral-400/10" },
  sh: { dot: "bg-lime-400", soft: "bg-lime-400/10" },
  txt: { dot: "bg-neutral-400", soft: "bg-neutral-400/10" },
};
const DEFAULT_EXT_COLOR = { dot: "bg-neutral-500", soft: "bg-neutral-500/10" };

export function fileExt(name = "") {
  return name.split(".").pop()?.toLowerCase() || "";
}
export function fileIconColor(name = "") {
  return (EXT_COLORS[fileExt(name)] || DEFAULT_EXT_COLOR).dot;
}
export function fileIconSoftColor(name = "") {
  return (EXT_COLORS[fileExt(name)] || DEFAULT_EXT_COLOR).soft;
}

export function formatBytes(n) {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function detectError(code, language) {
  if (!code || !code.trim()) return null;

  if (language === "javascript") {
    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
      return null;
    } catch (e) {
      return e.message;
    }
  }

  if (language === "json") {
    try {
      JSON.parse(code);
      return null;
    } catch (e) {
      return e.message;
    }
  }

  // JSX/TypeScript cannot be parsed by the browser's Function constructor.
  // Use a safe delimiter check instead of reporting false syntax errors.
  if (["jsx", "typescript"].includes(language)) {
    const pairs = [["(", ")"], ["[", "]"], ["{", "}"]];
    for (const [open, close] of pairs) {
      let depth = 0;
      for (const char of code) {
        if (char === open) depth++;
        if (char === close) depth--;
        if (depth < 0) return `Unexpected closing ${close}`;
      }
      if (depth !== 0) return `Unclosed ${open}`;
    }
  }

  return null;
}

// ---- Responsive breakpoints -------------------------------------------
// mobile   < 768
// tablet   768 - 1023
// laptop   1024 - 1439
// desktop  >= 1440 (ultrawide is desktop + extra width, handled with CSS)
export function getBreakpoint(width) {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  if (width < 1440) return "laptop";
  return "desktop";
}

export function useCodexBreakpoint() {
  const [bp, setBp] = useState(() => getBreakpoint(typeof window !== "undefined" ? window.innerWidth : 1280));
  useEffect(() => {
    const onResize = () => setBp(getBreakpoint(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return bp;
}

// ---- Virtual folder tree -------------------------------------------------
// The file entity has no folder concept, so a "folder" is just a "/" in the
// file name (e.g. "src/utils/math.js"). This builds a tree from that.
export function buildFileTree(files) {
  const root = { type: "folder", name: "", path: "", children: new Map() };
  for (const file of files) {
    const parts = (file.name || "untitled").split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const segment = parts[i];
      const path = node.path ? `${node.path}/${segment}` : segment;
      if (!node.children.has(path)) {
        node.children.set(path, { type: "folder", name: segment, path, children: new Map() });
      }
      node = node.children.get(path);
    }
    const leafName = parts[parts.length - 1] || file.name;
    node.children.set(`file:${file.id}`, { type: "file", name: leafName, path: file.name, file });
  }
  const toArray = (node) =>
    Array.from(node.children.values())
      .map((child) => (child.type === "folder" ? { ...child, children: toArray(child) } : child))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  return toArray(root);
}

export function lineAndColumn(text, caretIndex) {
  const upTo = text.slice(0, caretIndex);
  const lines = upTo.split("\n");
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

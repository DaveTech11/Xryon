// ZIP mode: only when the person attaches a .zip project does Xyron hand back a complete,
// updated ZIP. Without an attached ZIP, replies stay normal (individual files / plain text).

export const isZipFile = (file) =>
  !!file && (/\.zip$/i.test(file.name || "") || /zip/i.test(file.type || ""));

export const XYRON_ZIP_PROMPT = `ZIP project mode: the person attached a ZIP project (its file tree and key files are in your context). Work on THAT project — build what they ask (a bot, a feature, a fix) so it fits their existing code, imports, naming and dependencies.
- Write every file you create or change IN FULL as a \`path=\`-tagged fenced block, using the same relative paths as in their project. Do not use "..." or "rest unchanged" inside a file.
- Do NOT repeat files you didn't change, and don't paste their node_modules. The app automatically merges your files into their original ZIP and offers ONE complete ZIP download, so never ask them to zip, merge or copy anything by hand, and don't say you can't send a ZIP.
- If new packages are needed, include the updated package.json as a file. Finish with a short summary: what changed, how to run it (exact commands), and what you didn't test.`;

export const XYRON_NO_ZIP_PROMPT = `No ZIP project is attached, so answer normally. Don't offer, promise or mention a ZIP download; if files are needed, give them as \`path=\`-tagged blocks as usual.`;

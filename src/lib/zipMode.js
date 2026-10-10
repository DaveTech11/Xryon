// ZIP mode: only when the person attaches a .zip project does Xyron hand back a complete,
// updated ZIP. Without an attached ZIP, replies stay normal (individual files / plain text).

export const isZipFile = (file) =>
  !!file && (/\.zip$/i.test(file.name || "") || /zip/i.test(file.type || ""));

export const XYRON_ZIP_PROMPT = `ZIP project mode: the person attached a ZIP project (its file tree and key files are in your context). Work on THAT project — build what they ask (a bot, a feature, a fix) so it fits their existing code, imports, naming and dependencies.
- Write every file you create or change IN FULL as a \`path=\`-tagged fenced block, using the same relative paths as in their project. Do not use "..." or "rest unchanged" inside a file.
- Do NOT repeat files you didn't change, and don't paste their node_modules. The app automatically merges your files into their original ZIP and offers ONE complete ZIP download, so never ask them to zip, merge or copy anything by hand, and don't say you can't send a ZIP.
- If new packages are needed, include the updated package.json as a file. Finish with a short summary: what changed, how to run it (exact commands), and what you didn't test.`;

export const XYRON_NO_ZIP_PROMPT = `No ZIP project is attached, so answer normally. If files are needed, give them as \`path=\`-tagged blocks as usual; the app turns two or more of them into a ZIP download by itself.`;

// The person asked for a ZIP / downloadable files in a chat with no ZIP attached ("send the zip file").
export const wantsZipDownload = (text) =>
  /\bzip(ped)?\b|\bdownload(able)?\b|\b(send|give)\s+(me\s+)?(the\s+|all\s+|my\s+)?(files?|project|source|code)\b/i.test(String(text || ""));

export const XYRON_ZIP_REQUEST_PROMPT = `The person wants the project as downloadable files / a ZIP. The app builds the ZIP itself: every file you write as a \`path=\`-tagged fenced block gets a Download button, and two or more files get a "Download as ZIP" button with that exact folder structure. So:
- Write EVERY file of the project from this conversation in full, each as its own \`path=\`-tagged block with its real relative path (package.json, source files, README, .env.example, and so on). Put them all in this one reply.
- Never answer with a script that generates or builds a ZIP, never use base64 or code to assemble files, and never say you can't send a ZIP. Don't ask them to create or zip anything by hand.
- Binary files (audio, images, fonts) can't be written as text: leave them out and say in the Notes which file to add and where it goes.
- Keep the text around the files short: one line before, then the files, then the "## Notes" section.`;

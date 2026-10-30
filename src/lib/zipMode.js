// ZIP mode: only when the person attaches a .zip project does Xyron hand back a complete,
// updated ZIP. Without an attached ZIP, replies stay normal (individual files / plain text).

import { visualQueryFromText } from "./imageSearch";

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


// Any request to build / change code (no need to say "zip"): Xyron then works like Codex / Claude
// does when coding — a short plan, every file written in full, one ZIP to download, then notes.
const CODE_ACTION = /\b(build|create|make|write|give|bring|send|need|want|get|code|develop|generate|design|set\s?up|setup|add|fix|update|upgrade|edit|modify|implement|convert|port|refactor|improve|debug|rewrite|package|program)\b/i;
const CODE_THING = /\b(code|coding|program|script|bot|app|application|website|web\s?site|webpage|web\s?page|landing\s?page|api|server|backend|frontend|component|plugin|extension|game|project|bug|function|module|dashboard|scraper|cli|html|css|javascript|typescript|python|node(\.?js)?|react|vite|express|flask|django|telegram|whatsapp|discord|baileys|telegraf|webhook|database|schema|login|page|feature)\b|\.(js|mjs|jsx|ts|tsx|py|html|css|json|php|java|go|rs)\b/i;
const NOT_CODING = /^\s*(what\s+is|what's|who\s+is|why|explain|define|tell me about)\b/i;
export const wantsCode = (text) => {
  const t = String(text || "");
  return t.length > 6 && !visualQueryFromText(t) && !NOT_CODING.test(t) && CODE_ACTION.test(t) && CODE_THING.test(t);
};

export const XYRON_CODING_PROMPT = `Coding mode (this request is about building or changing code). Work the way Codex and Claude do when they code:
1. Open with ONE or TWO short lines saying what you'll build, then a compact "Plan" list of the files you'll create.
2. Write EVERY file in full as its own \`path=\`-tagged fenced block with its real relative path (package.json, source files, README.md, .env.example, and so on). No "...", no "rest unchanged", no snippets that skip parts, and never code without a path — all code goes in files.
3. The app packages them: each file gets a Download button and two or more files become ONE "Download as ZIP" card with that exact folder structure. So never say you can't make a ZIP, never ask the person to copy files or zip anything by hand, and never write a script or base64 that builds a ZIP.
4. Even a single-file task is delivered as a \`path=\`-tagged file, not a loose code block.
5. End with a "## Notes" section: what each file does, the exact commands to install and run it, and anything you did not test. Don't pretend you ran or tested anything.
Binary files (images, audio, fonts) can't be written as text: leave them out and say in the Notes where to add them.`;


// "Build me ..." in the normal chat works like Codex: the request goes to the Xyron Nexus coding model, the reply is a
// project (name, plan, every file in full, summary) and the chat shows it as ONE ZIP card. Only real build requests
// qualify (a new thing, or a change to a thing); explanations, questions and "how do I" stay normal chat.
const BUILD_VERB = /\b(build|create|make|give|bring|send|need|want|get|code|develop|generate|write|design|set\s?up|setup|program|implement|add|fix|update|upgrade|modify|refactor|rewrite|convert|port|improve|debug|optimi[sz]e|change|extend|integrate|adapt|customi[sz]e|finish|complete|clean\s?up|migrate|turn)\b/i;
const BUILD_THING = /\b(bot|app|application|website|web\s?site|webpage|web\s?page|landing\s?page|api|endpoint|route|server|backend|frontend|component|plugin|extension|game|project|script|program|dashboard|scraper|cli|tool|calculator|portfolio|store|shop|platform|system|page|feature|function|class|module|library|package|login|bug|error|code|command|cron|query|schema|database|html|css|javascript|typescript|python|node(\.?js)?|react|vite|express|flask|django|php|java|golang|rust|telegram|whatsapp|discord|baileys|telegraf|webhook)\b|\.(js|mjs|jsx|ts|tsx|py|html|css|json|php|java|go|rs)\b/i;
// Only pure "what is / explain / define" questions stay normal chat. "How do I make a bot" is a code request.
const NOT_A_BUILD = /^\s*(what\s+is|what's|what\s+are|what\s+does|who\s+is|why|how\s+does|explain|define|tell me about|can you explain|difference between|meaning of)\b/i;
const CODE_FILE = /\.(js|mjs|cjs|jsx|ts|tsx|py|html|css|json|php|java|go|rs|rb|c|cpp|cs|sh|sql|zip)$/i;

// Any request to build, fix or change code is handled like Codex: plan, every file in full, one ZIP, summary.
// fileNames: names of files attached to this message (a code file + "fix this" counts as a code request).
export const wantsBuild = (text, fileNames = []) => {
  const t = String(text || "").trim();
  if (t.length < 4 || t.startsWith("/") || NOT_A_BUILD.test(t)) return false;
  const hasVerb = BUILD_VERB.test(t);
  const hasPastedCode = /```/.test(t) || (t.split("\n").length > 4 && /[{};=]|=>|\bdef\s|\bfunction\b|\bimport\s/.test(t));
  const hasCodeFile = (fileNames || []).some((n) => CODE_FILE.test(String(n || "")));
  if (hasVerb && (hasPastedCode || hasCodeFile)) return true;
  if (t.length <= 10 || !hasVerb || !BUILD_THING.test(t)) return false;
  return !visualQueryFromText(t);
};

// A short change request right after Xyron built a project ("add dark mode", "now make it use MongoDB", "fix it")
// continues that project the Codex way, even though the message alone doesn't say "code".
const CHANGE_VERB = /\b(add|change|make|fix|remove|delete|update|use|replace|rename|improve|also|now|instead|switch|move|include|support|style|redo|again|rewrite|continue|finish|it|them)\b/i;
export const isBuildFollowUp = (text, history = []) => {
  const t = String(text || "").trim();
  if (!t || t.length > 400 || t.startsWith("/") || NOT_A_BUILD.test(t) || /^\s*(how|why|what|which|where|when|who|is|are|do|does)\b/i.test(t) || !CHANGE_VERB.test(t)) return false;
  const prev = [...history].reverse().find((m) => m.role === "assistant" && typeof m.content === "string");
  return !!prev && /^\s*PROJECT:\s*\S/m.test(prev.content) && /```[^\n]*\bpath=/.test(prev.content);
};

export const XYRON_BUILD_PROMPT = `You are in Xyron Codex mode inside the normal chat: the person wants software built, so work exactly like the Codex coding studio.

Reply in exactly this structure:

PROJECT: <short-kebab-case-name>
PLAN:
- <3 to 6 short bullets: what you will build and which files you will create>

Then write EVERY file in full, each as its own fenced block whose info string is the language, a space, then path= and the relative path. Example:

\`\`\`html path=index.html
...complete file...
\`\`\`

After the last file:

SUMMARY:
<2 to 5 short sentences: what it does, how to open or run it (exact commands for Node or Python projects), and anything you could not verify>

Rules:
- Write every file completely. No placeholders, no "rest of the code here", no TODO stubs, no "...".
- The files must be wired together correctly: matching paths, imports, ids and class names. Include package.json, README.md and .env.example when the project needs them.
- Unless the person asks for a framework, Node or Python, build plain HTML + CSS + JavaScript that works by opening index.html, with styles and scripts in their own files linked by relative paths.
- Never put API keys or secrets in code. Read them from environment variables and list them in .env.example.
- The app packages the files as ONE "Download as ZIP" card with exactly this folder structure. Never say you can't make a ZIP, never ask them to copy or zip anything by hand, and never write a script or base64 that builds a ZIP.
- If this project was already built earlier in this chat and the person asks for a change, write ALL of the project's files again in full (changed and unchanged), so the ZIP is complete.
- You cannot run code, install packages or test anything here. Never say that you did.
- Inside README.md use indented code, never triple backticks.
- Binary files (images, audio, fonts) can't be written as text: leave them out and say in the SUMMARY where to add them.`;

// Pulls the Codex-style PROJECT / PLAN / SUMMARY labels out of a reply so the chat can show them as a tidy heading.
export function splitBuildReply(text = "") {
  const src = String(text || "");
  const m = src.match(/^\s*PROJECT:\s*([A-Za-z0-9._ -]{1,60})\s*$/m);
  if (!m) return null;
  const project = m[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return { project: project || "xyron-project" };
}

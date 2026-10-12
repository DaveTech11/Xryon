// What kind of file is this, how should it be labelled, and what can Xyron do with it?

const EXT = {
  zip: "zip|rar|7z|tar|gz|tgz",
  image: "png|jpe?g|gif|webp|svg|bmp|heic|avif",
  doc: "pdf|docx?|pptx?|xlsx?|csv|tsv|txt|md|rtf|odt",
  code: "js|jsx|mjs|cjs|ts|tsx|py|java|php|html?|css|scss|json|go|rs|c|h|cpp|cs|rb|sh|bat|sql|kt|swift|dart|vue|svelte|ya?ml|toml|env|ini|xml|lua|r",
};

export const extOf = (name) => {
  const m = String(name || "").split("?")[0].split("#")[0].match(/\.([a-z0-9]{1,6})$/i);
  return m ? m[1].toLowerCase() : "";
};

export function nameFromUrl(url) {
  try {
    const last = decodeURIComponent(String(url || "").split("?")[0].split("/").pop() || "");
    // Uploaded files often get a "<timestamp>-" or random prefix; keep the readable tail.
    return last.replace(/^[0-9a-f]{8,}[-_]/i, "").replace(/^\d{10,}[-_]/, "") || "file";
  } catch { return "file"; }
}

export function fileKind(name) {
  const e = extOf(name);
  for (const [kind, list] of Object.entries(EXT)) if (new RegExp(`^(${list})$`, "i").test(e)) return kind;
  return "file";
}

// "ZIP", "PDF", "JS" … shown as the little tag on a file card.
export const extLabel = (name) => (extOf(name) ? extOf(name).toUpperCase() : "FILE");

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Turns a message's attachments into [{ url, name, kind, label, size }], using the saved names when we have them.
export function attachmentsOf(msg) {
  const meta = Array.isArray(msg?.file_meta) ? msg.file_meta : [];
  return (msg?.file_urls || []).map((url) => {
    const m = meta.find((x) => x.url === url);
    const name = m?.name || nameFromUrl(url);
    return { url, name, size: m?.size || 0, kind: fileKind(name), label: extLabel(name) };
  });
}

const BUILD = [
  ["Test and run", "Test and run {file}: go through it, point out anything that would fail, and give me the exact commands to install, test and run it. Say plainly that you haven't run it yourself."],
  ["Fix errors", "Find and fix the errors in {file}. Show every file you change in full, and explain briefly what was wrong."],
  ["Add more features", "Suggest the most useful features to add to {file}, then implement the best ones in full, wired in correctly."],
  ["Explain the code", "Explain how {file} works: the structure, what each main part does, and how the pieces connect."],
  ["Improve the design", "Improve the design and UX of {file}. Keep everything working and show every changed file in full."],
  ["Optimize", "Review {file} for performance problems and optimize it. Show every changed file in full and say what got faster and why."],
  ["Add comments", "Add clear, useful comments to {file} without changing how it behaves."],
  ["Write tests", "Write tests for {file}, tell me how to run them, and say plainly that you haven't run them yourself."],
  ["Security check", "Review {file} for security problems and fix the important ones."],
  ["Make it responsive", "Make {file} work well on phones, tablets and desktops. Show every changed file in full."],
];

const BY_KIND = {
  zip: BUILD,
  code: BUILD,
  image: [
    ["Describe it", "Describe {file} in detail."],
    ["Extract the text", "Extract all the text from {file}, keeping its structure."],
    ["What is this?", "Tell me what {file} shows and anything useful to know about it."],
  ],
  doc: [
    ["Summarize", "Summarize {file}."],
    ["Key points", "List the key points of {file}."],
    ["Explain simply", "Explain {file} in simple terms."],
    ["Translate", "Translate {file} into English, keeping the formatting."],
    ["Make a quiz", "Make a short quiz from {file}, with answers at the end."],
    ["Fix grammar", "Fix the grammar and spelling in {file} and show the corrected text."],
    ["Extract data", "Extract the important data from {file} into a clean table."],
  ],
  file: [
    ["Summarize", "Summarize {file}."],
    ["Explain it", "Explain what {file} is and what's in it."],
    ["Analyze", "Analyze {file} and tell me what stands out."],
  ],
};

export function optionsFor(items) {
  const kinds = items.map((i) => i.kind);
  const kind = kinds.includes("zip") ? "zip" : kinds.includes("code") ? "code" : kinds.includes("doc") ? "doc" : kinds.includes("image") ? "image" : "file";
  return BY_KIND[kind] || BY_KIND.file;
}

// The message sent for a pick (or a custom request) always names the file, so Xyron knows what it refers to.
export const fileRef = (items) => items.map((i) => `\`${i.name}\``).join(", ");
export const withFile = (prompt, items) => prompt.replace(/\{file\}/g, fileRef(items) || "the file");
export const customWithFile = (text, items) => `${String(text).trim()}\n\n(About ${fileRef(items) || "the file"})`;

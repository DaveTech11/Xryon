// Turns a report/email card into a ready Gmail draft.
//
// Gmail's compose link takes the subject and body in the URL, but very long URLs get cut off.
// So: a normal-length text goes straight into the draft; a long one is copied to the clipboard and
// the draft opens with a short "paste here" line instead, so nothing is ever silently lost.

import { copyToClipboard } from "./clipboard";

const MAX_ENCODED_BODY = 3000;

// Markdown -> the plain text an email body should contain.
export function toPlainText(md = "") {
  return String(md)
    .replace(/\r\n/g, "\n")
    .replace(/```[\w.+-]*[ \t]*\n?([\s\S]*?)```/g, (_m, code) => code.replace(/\n$/, ""))
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label, url) => (label.trim() === url ? url : `${label} (${url})`))
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function gmailComposeUrl({ subject = "", body = "" }) {
  const q = new URLSearchParams({ view: "cm", fs: "1", tf: "1", su: subject, body });
  // URLSearchParams writes spaces as "+", which Gmail shows literally in some clients.
  return `https://mail.google.com/mail/?${q.toString().replace(/\+/g, "%20")}`;
}

// Must be called straight from a click so the browser allows the new tab.
// -> { copied: boolean } : true when the text was too long for the link and was copied instead.
export function openInGmail({ subject, markdown }) {
  const text = toPlainText(markdown);
  const fits = encodeURIComponent(text).length <= MAX_ENCODED_BODY;
  if (!fits) copyToClipboard(text).catch(() => {});
  const body = fits ? text : "(Your full text is copied - press and hold here, then tap Paste.)";
  window.open(gmailComposeUrl({ subject, body }), "_blank", "noopener,noreferrer");
  return { copied: !fits };
}

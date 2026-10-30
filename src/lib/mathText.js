// Math support for chat answers (ChatGPT-style).
//
// Models write maths as \( ... \) / \[ ... \] (or $...$ / $$...$$). Markdown treats "\(" as an escaped
// "(" and throws the backslash away, which is why answers showed raw "(2^{x}=16)". Before the text reaches
// react-markdown we rewrite those delimiters into the $$ form that remark-math understands.
// Fenced code and `inline code` are never touched.

// Does a $...$ span look like maths (and not a price like "$5 and $10")?
const looksLikeMath = (s) => {
  if (!s || s !== s.trim()) return false;
  if (/^[\d.,]+$/.test(s)) return false;
  return /[\\^_{}=<>+\-*/]/.test(s) || /^[A-Za-z]$/.test(s);
};

function convertPlain(text) {
  let out = text;
  // \[ ... \]  -> display block
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body) => `\n\n$$\n${body.trim()}\n$$\n\n`);
  // \( ... \)  -> inline
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body) => `$$${body.trim()}$$`);
  // $...$ that really is maths -> $$...$$ (single-dollar parsing is off so prices stay prices)
  out = out.replace(/(^|[^$\\\w])\$([^$\n]+?)\$(?![\w$])/g, (m, pre, body) => (looksLikeMath(body) ? `${pre}$$${body}$$` : m));
  return out;
}

export function prepareMath(text = "") {
  if (!text || !/[\\$]/.test(text)) return text;
  // split into code (kept as is) and prose (converted)
  const parts = text.split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g);
  return parts.map((part, i) => (i % 2 === 1 ? part : convertPlain(part))).join("");
}

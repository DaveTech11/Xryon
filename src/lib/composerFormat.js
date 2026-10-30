// Markdown helpers for the chat box's expanded editor. Pure functions: give them the text and the selection, get back the
// new text and selection. The chat already renders Markdown, so formatting is just Markdown typed for the person.

const HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const QUOTE_RE = /^\s{0,3}>\s?/;
const BULLET_RE = /^\s*[-*+]\s+(\[[ xX]\]\s+)?/;
const NUMBER_RE = /^\s*\d+[.)]\s+/;

const result = (value, start, end = start) => ({ value, selStart: start, selEnd: end });

// The range of whole lines touched by the selection: [from, to) in `value`.
function lineRange(value, start, end) {
  const from = value.lastIndexOf("\n", Math.max(0, start) - 1) + 1;
  let to = value.indexOf("\n", end);
  if (to === -1) to = value.length;
  return [from, to];
}

// Rewrites each selected line with `fn(line, index)` and keeps the selection over the changed block.
function mapLines(value, start, end, fn) {
  const [from, to] = lineRange(value, start, end);
  const lines = value.slice(from, to).split("\n").map(fn);
  const block = lines.join("\n");
  return result(value.slice(0, from) + block + value.slice(to), from, from + block.length);
}

function wrap(value, start, end, mark, placeholder) {
  const sel = value.slice(start, end);
  // Already wrapped right around the selection: unwrap.
  if (sel && value.slice(start - mark.length, start) === mark && value.slice(end, end + mark.length) === mark) {
    return result(value.slice(0, start - mark.length) + sel + value.slice(end + mark.length), start - mark.length, end - mark.length);
  }
  if (sel.length >= mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark)) {
    const inner = sel.slice(mark.length, sel.length - mark.length);
    return result(value.slice(0, start) + inner + value.slice(end), start, start + inner.length);
  }
  const text = sel || placeholder;
  const next = value.slice(0, start) + mark + text + mark + value.slice(end);
  return result(next, start + mark.length, start + mark.length + text.length);
}

// Puts a block on its own lines (blank line before and after when there is other text around it).
function block(value, start, end, text, selectFrom, selectTo) {
  const before = value.slice(0, start), after = value.slice(end);
  const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const tail = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  const at = before.length + lead.length;
  return result(before + lead + text + tail + after, at + selectFrom, at + selectTo);
}

const stripBlock = (l) => l.replace(HEADING_RE, "").replace(QUOTE_RE, "").replace(BULLET_RE, "").replace(NUMBER_RE, "");

export function applyFormat(value, selStart, selEnd, kind) {
  const v = String(value ?? "");
  const start = Math.max(0, Math.min(selStart ?? v.length, v.length));
  const end = Math.max(start, Math.min(selEnd ?? start, v.length));

  const level = /^h([1-6])$/.exec(kind);
  if (level) {
    const prefix = `${"#".repeat(Number(level[1]))} `;
    return mapLines(v, start, end, (l) => (l.trim() === "" ? l : prefix + stripBlock(l)));
  }
  switch (kind) {
    case "text": return mapLines(v, start, end, stripBlock);
    case "bold": return wrap(v, start, end, "**", "bold text");
    case "italic": return wrap(v, start, end, "_", "italic text");
    case "code": return wrap(v, start, end, "`", "code");
    case "strike": return wrap(v, start, end, "~~", "text");
    case "quote": {
      const [from, to] = lineRange(v, start, end);
      const all = v.slice(from, to).split("\n").every((l) => QUOTE_RE.test(l) || l.trim() === "");
      return mapLines(v, start, end, (l) => (all ? l.replace(QUOTE_RE, "") : l.trim() === "" ? l : `> ${l.replace(QUOTE_RE, "")}`));
    }
    case "bullet": case "numbered": case "task": {
      const re = kind === "numbered" ? NUMBER_RE : BULLET_RE;
      const [from, to] = lineRange(v, start, end);
      const lines = v.slice(from, to).split("\n");
      const all = lines.every((l) => l.trim() === "" || re.test(l));
      let n = 0;
      return mapLines(v, start, end, (l) => {
        if (l.trim() === "") return l;
        if (all) return l.replace(re, "");
        n++;
        const bare = stripBlock(l);
        return kind === "numbered" ? `${n}. ${bare}` : kind === "task" ? `- [ ] ${bare}` : `- ${bare}`;
      });
    }
    case "codeblock": {
      const sel = v.slice(start, end);
      const body = sel || "code";
      const text = "```\n" + body + "\n```";
      return block(v, start, end, text, 4, 4 + body.length);
    }
    case "divider": return block(v, start, end, "---", 3, 3);
    case "table": {
      const t = "| Header | Header |\n| --- | --- |\n| Cell | Cell |\n| Cell | Cell |";
      return block(v, start, end, t, 2, 8);
    }
    case "link": {
      const sel = v.slice(start, end);
      const label = sel || "link text";
      const next = `${v.slice(0, start)}[${label}](https://)${v.slice(end)}`;
      const urlAt = start + label.length + 3; // right after "]("
      return result(next, urlAt, urlAt + "https://".length);
    }
    default: return result(v, start, end);
  }
}

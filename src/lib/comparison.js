// Visual comparisons ("iPhone 17 vs Galaxy S26"): detects an A-vs-B query
// and fetches a lightweight entity preview (image + description + quick
// facts) for each side, reusing entityPreview.js entirely — no separate
// data source, so the two cards are only ever populated with facts that
// are actually sourced from Wikipedia/Wikidata.

import { fetchEntityPreview } from "./entityPreview";

const ALLOWED_COMMANDS = new Set(["/compare"]);

const VS = /^(.{1,40}?)\s+(?:vs\.?|versus)\s+(.{1,40})$/i;
const COMPARE_LEAD = /^(?:please\s+)?compare\s+/i;
const AND_SPLIT = /\s*(?:,|\band\b)\s*/i;
const REJECT_WORDS = /\b(difference|between|price|prices|which|better|best|worst|should|how|why|our|my|your)\b/i;

// -> { a, b } when the message names exactly two things to compare, else null.
export function detectComparisonQuery(text = "", { command = null, hasFiles = false } = {}) {
  if (hasFiles) return null;
  let raw;
  if (command) {
    if (!ALLOWED_COMMANDS.has(command.cmd.command)) return null;
    raw = command.arg || "";
  } else if (text.trim().startsWith("/")) {
    return null;
  } else {
    raw = text;
  }

  raw = raw.replace(/[?!.\s]+$/, "").trim();
  if (!raw || raw.length > 90 || /\n/.test(raw)) return null;

  let a, b;
  const vs = raw.match(VS);
  if (vs) {
    [, a, b] = vs;
  } else if (COMPARE_LEAD.test(raw) || command) {
    const rest = raw.replace(COMPARE_LEAD, "");
    const parts = rest.split(AND_SPLIT).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) [a, b] = parts;
  }
  if (!a || !b) return null;

  a = a.trim(); b = b.trim();
  if (!a || !b) return null;
  if (a.split(/\s+/).length > 6 || b.split(/\s+/).length > 6) return null;
  if (REJECT_WORDS.test(a) || REJECT_WORDS.test(b)) return null;
  if (a.toLowerCase() === b.toLowerCase()) return null;
  return { a, b };
}

// Returns { status: "ready", a, b } where a/b are entityPreview objects
// (or null if a side couldn't be found) — never invents data for a side
// that has no reliable source.
export async function fetchComparisonPreview({ a, b }) {
  const [pa, pb] = await Promise.all([
    fetchEntityPreview({ query: a, kind: "lookup" }),
    fetchEntityPreview({ query: b, kind: "lookup" }),
  ]);
  if (!pa && !pb) return null;
  return { status: "ready", a: pa, b: pb, aQuery: a, bQuery: b };
}


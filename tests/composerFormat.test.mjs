import test from "node:test";
import assert from "node:assert/strict";
import { applyFormat } from "../src/lib/composerFormat.js";

test("bold wraps the selection and unwraps it again", () => {
  const a = applyFormat("make this loud", 5, 9, "bold");
  assert.equal(a.value, "make **this** loud");
  assert.equal(a.value.slice(a.selStart, a.selEnd), "this");
  const b = applyFormat(a.value, a.selStart, a.selEnd, "bold");
  assert.equal(b.value, "make this loud");
});

test("bold with nothing selected adds a placeholder that is selected", () => {
  const r = applyFormat("", 0, 0, "bold");
  assert.equal(r.value, "**bold text**");
  assert.equal(r.value.slice(r.selStart, r.selEnd), "bold text");
});

test("headings replace an existing heading level and only touch selected lines", () => {
  const r = applyFormat("first\nsecond\nthird", 6, 12, "h2");
  assert.equal(r.value, "first\n## second\nthird");
  const again = applyFormat(r.value, r.selStart, r.selEnd, "h4");
  assert.equal(again.value, "first\n#### second\nthird");
});

test("text removes heading, quote and list markers", () => {
  const r = applyFormat("## title\n> quoted\n- item", 0, 23, "text");
  assert.equal(r.value, "title\nquoted\nitem");
});

test("quote toggles on and off for several lines", () => {
  const on = applyFormat("a\nb", 0, 3, "quote");
  assert.equal(on.value, "> a\n> b");
  assert.equal(applyFormat(on.value, on.selStart, on.selEnd, "quote").value, "a\nb");
});

test("bullet and numbered lists number lines and toggle off", () => {
  const n = applyFormat("one\ntwo\n\nthree", 0, 13, "numbered");
  assert.equal(n.value, "1. one\n2. two\n\n3. three");
  assert.equal(applyFormat(n.value, n.selStart, n.selEnd, "numbered").value, "one\ntwo\n\nthree");
  assert.equal(applyFormat("x", 0, 1, "bullet").value, "- x");
  assert.equal(applyFormat("x", 0, 1, "task").value, "- [ ] x");
});

test("code block wraps the selection in fences and keeps blank lines around it", () => {
  const r = applyFormat("before\nconst a = 1;\nafter", 7, 19, "codeblock");
  assert.equal(r.value, "before\n\n```\nconst a = 1;\n```\n\nafter");
  assert.equal(r.value.slice(r.selStart, r.selEnd), "const a = 1;");
});

test("divider and table are inserted as their own blocks", () => {
  assert.equal(applyFormat("hi", 2, 2, "divider").value, "hi\n\n---");
  const t = applyFormat("", 0, 0, "table");
  assert.ok(t.value.startsWith("| Header | Header |\n| --- | --- |"));
});

test("link uses the selection as the label and selects the url", () => {
  const r = applyFormat("see docs now", 4, 8, "link");
  assert.equal(r.value, "see [docs](https://) now");
  assert.equal(r.value.slice(r.selStart, r.selEnd), "https://");
});

test("out-of-range selections and unknown kinds are safe", () => {
  assert.equal(applyFormat("abc", 99, 120, "bold").value, "abc**bold text**");
  assert.equal(applyFormat("abc", 0, 1, "nope").value, "abc");
});

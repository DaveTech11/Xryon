import test from "node:test";
import assert from "node:assert/strict";
import { needsCodingPrompts as g } from "../src/lib/codingGate.js";

const code = { role: "assistant", content: "Here you go\n```jsx path=src/App.jsx\nexport default 1\n```" };
test("everyday messages do not get the coding prompts", () => {
  for (const t of ["⛩ TEAM TEMPEST ⛩ I NEED BETTER NAME", "hi", "give me a recipe for jollof rice", "write a poem about rain", "what should I name my cat", "how do I ask my boss for a raise"])
    assert.equal(g({ text: t }), false, t);
});
test("naming stays non-coding even right after code", () => {
  assert.equal(g({ text: "I NEED BETTER NAME", history: [code] }), false);
});
test("code requests keep the coding prompts", () => {
  for (const t of ["build me a telegram bot", "fix this error: undefined is not a function", "write a python script to rename files", "make a landing page", "explain how react hooks work", "why is my api returning 500", "send me the zip file"])
    assert.equal(g({ text: t }), true, t);
});
test("code attachments and pasted code count", () => {
  assert.equal(g({ text: "check this", fileNames: ["app.js"] }), true);
  assert.equal(g({ text: "```js\nconst a = 1\n```" }), true);
});
test("short follow-up to a code answer stays in coding", () => {
  assert.equal(g({ text: "now add dark mode", history: [code] }), true);
  assert.equal(g({ text: "why did that fail?", history: [code] }), true);
  assert.equal(g({ text: "thanks", history: [code] }), false);
});
test("forced (build / zip / command) always wins", () => {
  assert.equal(g({ text: "hello", forced: true }), true);
});

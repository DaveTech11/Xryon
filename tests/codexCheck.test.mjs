import test from "node:test";
import assert from "node:assert/strict";
import { scanBalance, checkProject, plannedFiles, looksLikeJsx } from "../src/components/xyron/codex/codexCheck.js";

test("balanced JS passes, including strings, regex, templates and comments", () => {
  const ok = `
    // don't confuse the scanner ( [ {
    const re = /[(\\]]+\\//g; const a = 4 / 2 / 1;
    const s = "a ) b"; const t = \`x \${ fn({ a: [1, 2] }) } \${ \`nested \${1}\` } y\`;
    /* ) */ function f(a) { return a ? { k: [1] } : null }
  `;
  assert.equal(scanBalance(ok), null);
});

test("JS problems are located", () => {
  assert.match(scanBalance("function f() {\n if (x) {\n  y();\n}\n"), /Unclosed "\{" opened on line 1/);
  assert.match(scanBalance("const a = (1 + 2));"), /Unexpected "\)"/);
  assert.match(scanBalance("const a = [1, 2);"), /Mismatched/);
  assert.match(scanBalance("const s = 'oops;\nnext();"), /Unterminated string on line 1/);
  assert.match(scanBalance("const t = `abc"), /Unterminated template/);
});

test("css and python", () => {
  assert.equal(scanBalance("a { color: red; } /* } */ b::after { content: '}' }", "css"), null);
  assert.match(scanBalance("a { color: red;", "css"), /Unclosed/);
  assert.equal(scanBalance("def f(x):\n    return [x, (1)]\n# )\n", "py"), null);
  assert.match(scanBalance("x = [1, 2\nprint(x)", "py"), /Unclosed/);
  assert.match(scanBalance('s = """never ends', "py"), /triple/);
  assert.match(scanBalance("if x:\n\treturn 1\nif y:\n    return 2\n", "py"), /tabs and spaces/);
});

test("jsx detection", () => {
  assert.ok(looksLikeJsx("import React from 'react';\nexport default () => <App title=\"x\" />"));
  assert.ok(!looksLikeJsx("const a = 1 < 2;"));
});

const f = (path, value) => ({ path, value });

test("HTML wiring: missing script, stylesheet and element id", () => {
  const files = [
    f("index.html", `<link rel="stylesheet" href="style.css"><script src="https://cdn.x/y.js"></script><div id="app"></div><script src="js/app.js"></script>`),
    f("style.css", "a{}"),
    f("app.js", `document.getElementById("app"); document.getElementById("missing");`),
  ];
  const msgs = checkProject(files).map((p) => p.message);
  assert.equal(msgs.length, 2);
  assert.ok(msgs.some((m) => m.includes("js/app.js")));
  assert.ok(msgs.some((m) => m.includes('getElementById("missing")')));
});

test("ids created from JS are accepted", () => {
  const files = [f("index.html", `<script src="a.js"></script>`), f("a.js", `const d = document.createElement("div"); d.id = "box"; document.body.append(d); document.getElementById("box");`)];
  assert.equal(checkProject(files).length, 0);
});

test("Node wiring", () => {
  const files = [
    f("package.json", JSON.stringify({ name: "x", main: "server.js", scripts: { start: "node server.js" }, dependencies: { express: "^4.19.2" } })),
    f("index.js", `import express from "express";\nimport cors from "cors";\nimport { a } from "./util.js";\nimport fs from "node:fs";\nimport path from "path";`),
  ];
  const msgs = checkProject(files).map((p) => p.message).join("\n");
  assert.match(msgs, /"main" points to server\.js/);
  assert.match(msgs, /start script runs server\.js/);
  assert.match(msgs, /"cors"/);
  assert.match(msgs, /"\.\/util\.js"/);
  assert.match(msgs, /no "type": "module"/);
  assert.ok(!/express"/.test(msgs.replace("uses the package", "")) || !/package "express"/.test(msgs));
});

test("CommonJS in a type:module project is flagged; clean project is quiet", () => {
  const bad = [f("package.json", JSON.stringify({ type: "module", scripts: { start: "node app.js" } })), f("app.js", `const x = require("fs");`)];
  assert.match(checkProject(bad).map((p) => p.message).join(), /require\(\)/);
  const good = [f("package.json", JSON.stringify({ type: "module", scripts: { start: "node app.js" }, dependencies: { express: "^4" } })), f("app.js", `import express from "express";\nimport "./lib/x.js";`), f("lib/x.js", "export const a=1"), f(".env.example", "A=1")];
  assert.equal(checkProject(good).length, 0);
});

test("python without requirements.txt, env note", () => {
  const p = checkProject([f("main.py", "import requests\nimport os\nprint(os.environ['A'])")]);
  assert.ok(p.some((x) => x.path === "requirements.txt" && x.severity === "error"));
  const n = checkProject([f("a.js", "console.log(process.env.TOKEN)")]);
  assert.ok(n.some((x) => x.path === ".env.example" && x.severity === "note"));
});

test("plannedFiles finds paths in plan bullets", () => {
  assert.deepEqual(plannedFiles(["index.html with the layout", "`src/app.js` for logic and style.css", "Add a .env.example"]).sort(), [".env.example", "index.html", "src/app.js", "style.css"].sort());
});

import { buildPlainUrl } from "../rebix.mjs";
test("Codex fallback URL keeps its build instructions when the project context is large", () => {
  const system = "BUILD-CONTRACT ".repeat(150); // ~2.2 KB of instructions
  const big = [{ role: "user", content: "FILES " + "x".repeat(30000) + " Request: add a dark mode" }];
  const keep = decodeURIComponent(buildPlainUrl("claude-session", big, system, { keepSystem: true }));
  assert.ok(keep.includes(system.trim()), "instructions survive");
  assert.ok(keep.includes("add a dark mode"), "latest request survives");
  assert.ok(buildPlainUrl("claude-session", big, system, { keepSystem: true }).length <= 7000);
  const old = decodeURIComponent(buildPlainUrl("claude-session", big, system));
  assert.ok(!old.includes(system.trim()), "default behaviour is unchanged (instructions are shrunk first)");
});

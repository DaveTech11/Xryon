import test from 'node:test';
import assert from 'node:assert/strict';
import { jailArgs, toolAllowed } from '../reaAgent.mjs';
import { detectKind, keywordFrom, wantsRea } from '../rea.mjs';

test('tool policy allows analysis and refuses runtime/network tools', () => {
  for (const n of ['open_binary', 'search_strings', 'trace_call_path', 'decompile_all', 'analyze_javascript_application']) assert.equal(toolAllowed(n), true, n);
  for (const n of ['capture_process_scenario', 'inspect_web_page', 'launch_provenance', 'inspect_adb_client', 'frida_attach', 'install_x']) assert.equal(toolAllowed(n), false, n);
});
test('path jail keeps every path inside the work folder', () => {
  const root = '/tmp/w';
  for (const a of [{ path: '/etc/passwd' }, { path: '../x' }, { url: 'https://evil.com' }, { query: '../../etc/passwd' }, { source: { path: '/root/.ssh/id_rsa' } }]) assert.throws(() => jailArgs(a, root));
  assert.deepEqual(jailArgs({ path: 'a/b.exe', query: '/api/login' }, root), { path: '/tmp/w/a/b.exe', query: '/api/login' });
});
test('file kinds are found from the first bytes', async () => {
  const pad = (a) => Buffer.concat([Buffer.from(a), Buffer.alloc(64)]);
  assert.equal(await detectKind(pad([0x4d, 0x5a]), 'x.bin'), 'pe');
  assert.equal(await detectKind(pad([0x7f, 0x45, 0x4c, 0x46]), 'x.bin'), 'elf');
  assert.equal(await detectKind(pad([0x00, 0x61, 0x73, 0x6d]), 'x.bin'), 'wasm');
  assert.equal(await detectKind(Buffer.from('SQLite format 3\0' + ' '.repeat(40)), 'x.bin'), 'sqlite');
  assert.equal(await detectKind(Buffer.from('just some plain text here, nothing binary at all'), 'x.txt'), 'unknown');
  assert.equal(await detectKind(Buffer.from('%PDF-1.7\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0'), 'x.pdf'), 'unknown');
});
test('intent and keyword', () => {
  assert.equal(wantsRea('what does this exe do'), true);
  assert.equal(wantsRea('hello there'), false);
  assert.equal(wantsRea('reverse enginner this app'), true);
  assert.equal(wantsRea('reverse engineering this'), true);
  assert.equal(keywordFrom('how does the login work in this app?'), 'login');
});

import { parseAction, stepLabel, compactHistory } from '../reaAgent.mjs';
import { newTrail, applyStep, trailMarkdown } from '../src/lib/reaTrail.js';

test('agent actions: plan + parallel tools, legacy shape, code fences, final', () => {
  const a = parseAction('```json\n{"plan":["a","b"],"thought":"why","tools":[{"tool":"x","args":{"q":1}},{"tool":"y"},{"tool":"z"},{"tool":"w"}]}\n```');
  assert.deepEqual(a.plan, ['a', 'b']); assert.equal(a.tools.length, 3); assert.equal(a.thought, 'why');
  assert.deepEqual(parseAction('{"tool":"open_binary","args":{"path":"p"}}').tools, [{ tool: 'open_binary', args: { path: 'p' } }]);
  assert.equal(parseAction('{"final":"done"}').final, 'done');
  assert.equal(parseAction('just words').final, 'just words');
});
test('step labels read like a coding agent', () => {
  assert.equal(stepLabel('search_strings', { query: 'login' }), 'Searching "login"');
  assert.equal(stepLabel('decompile_function', { name: 'main' }), 'Decompiling "main"');
  assert.equal(stepLabel('open_binary'), 'Opening the file');
});
test('history compaction shortens only old tool results', () => {
  const h = [{ role: 'user', content: 'q' }];
  for (let i = 0; i < 8; i++) { h.push({ role: 'assistant', content: '{}' }); h.push({ role: 'user', content: `Result of t${i}:\n` + 'x'.repeat(9000) }); }
  const c = compactHistory(h, 2, 20000);
  assert.ok(c.reduce((n, m) => n + m.content.length, 0) < 30000);
  assert.ok(c.at(-1).content.length > 8000);          // newest stays whole
  const small = h.slice(0, 3); assert.equal(compactHistory(small, 2, 1e9), small);
});
test('live trail renders plan, tool status and checking', () => {
  const t = newTrail();
  for (const e of [{ type: 'start', kind: 'pe', name: 'a.exe' }, { type: 'plan', items: ['Open', 'Search'] }, { type: 'progress', done: [0] }, { type: 'tool', n: 1, label: 'Opening the file' }, { type: 'result', n: 1, ok: true }, { type: 'tool', n: 2, label: 'Searching "x"' }, { type: 'verify' }]) applyStep(t, e);
  const md = trailMarkdown(t);
  assert.match(md, /✓ Open/); assert.match(md, /○ Search/); assert.match(md, /✓ Opening the file/); assert.match(md, /… Searching "x"/); assert.match(md, /Checking every finding/);
});

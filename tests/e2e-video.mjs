// End-to-end check of /api/functions/videoPlan against the REAL server.mjs with a mock AI provider (no internet, no keys).
// Run: node tests/e2e-video.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const MOCK_PORT = 4931, APP_PORT = 4932, M = `http://127.0.0.1:${MOCK_PORT}`;
const seen = [];
const PLAN = { title: 'Mama Ade Bakery', brand: 'Mama Ade', theme: 'ember', music: 'upbeat', scenes: [
  { type: 'title', title: 'Fresh bread every morning', text: 'Baked in Port Harcourt' },
  { type: 'image', image: 0, title: 'Our shop front' },
  { type: 'cards', title: 'Our prices', items: [{ label: 'Small loaf', value: '₦700' }, { label: 'Big loaf', value: '₦1,200' }] },
  { type: 'cta', title: 'Order today', text: '0800 000 0000', image: 99, src: 'http://evil.example/x.png' }] };
const mock = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c; seen.push(body);
  const reply = body.includes('storyboard writer') ? '```json\n' + JSON.stringify(PLAN) + '\n```' : 'MOCK';
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ output: reply, reply, choices: [{ message: { content: reply } }] }));
});
await new Promise((r) => mock.listen(MOCK_PORT, r));

const dir = mkdtempSync(path.join(tmpdir(), 'xyron-video-'));
mkdirSync(path.join(dir, 'data'));
writeFileSync(path.join(dir, 'menu.txt'), 'Small loaf N700. Big loaf N1200. Open 7am to 9pm.');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
writeFileSync(path.join(dir, 'shop.png'), png);
const u = (id) => ({ id, email: id + '@test.dev', full_name: id, role: 'user', emailVerified: true, created_date: new Date().toISOString() });
writeFileSync(path.join(dir, 'data', 'xyron.json'), JSON.stringify({
  users: [u('free1'), u('other1')], sessions: [{ id: 'S_FREE', userId: 'free1' }, { id: 'S_OTHER', userId: 'other1' }], subscriptions: [],
  files: [{ id: 'doc1', userId: 'free1', mime: 'text/plain', name: 'menu.txt', size: 60, path: path.join(dir, 'menu.txt') },
          { id: 'img1', userId: 'free1', mime: 'image/png', name: 'shop.png', size: png.length, path: path.join(dir, 'shop.png') }],
  conversations: [], messages: [], usage: [], memories: [], settings: {},
}));
const srv = spawn('node', [path.resolve('server.mjs')], { cwd: dir, env: { PATH: process.env.PATH, ANTISCRAPE: 'off', PORT: String(APP_PORT), REBIX_API_BASE: `${M}/api`, GPTLOGIC_API_URL: `${M}/api/gptlogic`, NEXUS_API_URL: `${M}/nexus`, NEXUS_API_KEY: 'test', VORTYX_API_URL: `${M}/vortyx/v1`, VORTYX_API_KEY: 'test', FREE_AI_SWITCH_MS: '1500', RATE_LIMIT_PER_MINUTE: '1000' } });
const logs = []; srv.stdout.on('data', (d) => logs.push(String(d))); srv.stderr.on('data', (d) => logs.push(String(d)));
const stop = () => { srv.kill(); mock.close(); }; process.on('exit', stop);
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/auth/me`); if (r.status === 401 || r.status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

const call = async (session, body) => { const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/functions/videoPlan`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `xyron_session=${session}` }, body: JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
let n = 0; const ok = (label, fn) => { try { fn(); n++; console.log('ok  ', label); } catch (e) { console.log('FAIL', label, '-', e.message); process.exitCode = 1; } };

const a = await call('S_FREE', { request: 'make a promo video for my bakery using these', file_urls: ['/api/files/doc1', '/api/files/img1', '/api/files/NOT_MINE'], aspect: 'vertical' });
ok('returns a plan', () => { assert.equal(a.status, 200); assert.equal(a.plan.title, 'Mama Ade Bakery'); assert.equal(a.plan.theme, 'ember'); });
ok('the attached image (and only it) is in the plan', () => { assert.deepEqual(a.plan.images, ['/api/files/img1']); assert.equal(a.plan.scenes.find((s) => s.type === 'image').image, 0); });
ok('AI cannot smuggle urls or bad image numbers', () => { assert.ok(a.plan.scenes.every((s) => !('src' in s))); assert.equal(a.plan.scenes.at(-1).type, 'cta'); assert.ok(!('image' in a.plan.scenes.at(-1))); });
ok('the attached document text reached the AI together with the words', () => { const b = seen.find((x) => x.includes('storyboard writer')) || ''; assert.match(b, /Big loaf N1200/); assert.match(b, /promo video for my bakery/); });
const b = await call('S_FREE', { request: 'make a promo video', file_urls: [] });
ok('second video of the day works', () => assert.equal(b.status, 200));
const c = await call('S_FREE', { request: 'one more video please about my bakery' });
ok('free daily limit (2) then 429 video_limit', () => { assert.equal(c.status, 429); assert.equal(c.error, 'video_limit'); });
const d = await call('S_OTHER', { request: 'video using someone elses file', file_urls: ['/api/files/doc1', '/api/files/img1'] });
ok('another user cannot use my files', () => { assert.equal(d.status, 200); assert.deepEqual(d.plan.images, []); assert.ok(!seen.slice(-1)[0].includes('Big loaf N1200')); });
const e = await call('S_OTHER', {});
ok('empty request is rejected', () => assert.equal(e.status, 400));
console.log(`\n${n}/8 passed`); stop(); process.exit(process.exitCode || 0);

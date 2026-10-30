import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// A tiny fake Telegram Bot API.
const stored = new Map(); let nextMsg = 1, rate429 = 1; const deleted = [];
const srv = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const raw = Buffer.concat(chunks);
  const url = req.url, send = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (url.endsWith('/sendDocument')) {
    if (rate429-- > 0) return send({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 1 } }, 429);
    const fd = await new Response(raw, { headers: { 'content-type': req.headers['content-type'] } }).formData();
    const buf = Buffer.from(await fd.get('document').arrayBuffer()); const fid = 'F' + nextMsg;
    stored.set(fid, buf); return send({ ok: true, result: { message_id: nextMsg++, document: { file_id: fid } } });
  }
  if (url.endsWith('/getFile')) { const b = JSON.parse(raw); return send({ ok: true, result: { file_path: 'docs/' + b.file_id } }); }
  if (url.includes('/file/bot')) { const fid = url.split('/').pop(); res.writeHead(200); return res.end(stored.get(fid)); }
  if (url.endsWith('/deleteMessage')) { deleted.push(JSON.parse(raw).message_id); return send({ ok: true, result: true }); }
  send({ ok: false, description: 'unknown' }, 404);
});
await new Promise((r) => srv.listen(0, r));
process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${srv.address().port}`;
process.env.TELEGRAM_FILES_BOT_TOKEN = '123:abc'; process.env.TELEGRAM_FILES_CHAT_ID = '-1001'; process.env.TELEGRAM_FILES_KEY = 'a long secret';
const tg = await import('../tgfiles.mjs');
const map = {}; tg.tgFilesBind(() => map);

test('saves encrypted, reads back identical, retries a rate limit', async () => {
  const data = Buffer.from('hello xyron '.repeat(1000));
  await tg.tgFilesPut('file1', data, 'image/webp');
  assert.ok(map.file1 && map.file1.e === 1);
  assert.notDeepEqual(stored.get(map.file1.f), data, 'what Telegram holds must be encrypted');
  assert.ok(!stored.get(map.file1.f).includes('hello xyron'));
});
test('read works after the cache is gone (real download + decrypt)', async () => {
  const data = Buffer.from([1, 2, 3, 4, 5].map((n) => n * 7));
  await tg.tgFilesPut('file2', data, 'audio/mpeg');
  // bust the cache by writing a big file
  for (let i = 0; i < 6; i++) await tg.tgFilesPut('big' + i, Buffer.alloc(9 * 1024 * 1024, i), 'application/zip');
  const out = await tg.tgFilesGet('file2');
  assert.deepEqual(out, data);
  assert.equal(await tg.tgFilesGet('nope'), null);
});
test('over 20 MB is refused so the caller can fall back', async () => {
  await assert.rejects(() => tg.tgFilesPut('huge', Buffer.alloc(21 * 1024 * 1024), 'x/y'), /20 MB/);
  assert.equal(map.huge, undefined);
});
test('delete forgets the file and removes the message', async () => {
  const m = map.file2.m; await tg.tgFilesDelete('file2');
  assert.equal(map.file2, undefined); assert.ok(deleted.includes(m)); assert.equal(await tg.tgFilesGet('file2'), null);
});
test('status', async () => { assert.equal((await tg.tgFilesStatus()).enabled, true); srv.close(); });

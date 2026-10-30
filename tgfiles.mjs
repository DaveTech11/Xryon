// Telegram as a free file store: uploads, generated images and songs are saved as documents in a PRIVATE Telegram
// channel/chat and read back on demand, so they take no room in Postgres or R2.
//
// Env vars (Render):
//   TELEGRAM_FILES_BOT_TOKEN   token of the bot (BotFather). Make the bot an ADMIN of the channel (post + delete messages).
//   TELEGRAM_FILES_CHAT_ID     channel id (starts with -100...) or a private chat id
//   TELEGRAM_FILES_KEY         optional but recommended: any long secret. Files are encrypted (AES-256-GCM) before they leave
//                              the server, so nobody who joins the channel can read them. Do not lose or change it.
//   TELEGRAM_FILES=1           optional: reuse TELEGRAM_BACKUP_BOT_TOKEN / TELEGRAM_BACKUP_CHAT_ID instead of separate ones
//
// How it works: each file is sent with sendDocument; Telegram's file_id + message_id are kept in db.tgFiles (inside the app
// state, which the Telegram backup also contains). Reads use getFile (bots can download up to 20 MB, so bigger files are
// not sent here and fall back to R2/Postgres). A small in-memory cache keeps recent files so repeat views are instant.
import crypto from 'node:crypto';

const BASE = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const shared = () => process.env.TELEGRAM_FILES === '1';
const TOKEN = () => (process.env.TELEGRAM_FILES_BOT_TOKEN || (shared() ? process.env.TELEGRAM_BACKUP_BOT_TOKEN : '') || '').trim();
const CHAT = () => (process.env.TELEGRAM_FILES_CHAT_ID || (shared() ? process.env.TELEGRAM_BACKUP_CHAT_ID : '') || '').trim();
const SECRET = () => (process.env.TELEGRAM_FILES_KEY || '').trim();
export const tgFilesEnabled = () => Boolean(TOKEN() && CHAT());

const GET_LIMIT = 20 * 1024 * 1024;
const CACHE_MAX = (Number(process.env.TELEGRAM_FILES_CACHE_MB) || 40) * 1024 * 1024;

let getMap = () => null;
// server.mjs passes a function that returns the live db.tgFiles object ({ [fileId]: { f, m, e } }).
export const tgFilesBind = (fn) => { getMap = fn; };
export const tgFilesHas = (id) => Boolean(getMap()?.[id]);
export const tgFilesCount = () => Object.keys(getMap() || {}).length;

const cache = new Map(); let cacheBytes = 0;
const cacheGet = (id) => { const v = cache.get(id); if (v) { cache.delete(id); cache.set(id, v); } return v; };
function cacheSet(id, buf) {
  if (buf.length > CACHE_MAX / 2) return;
  if (cache.has(id)) { cacheBytes -= cache.get(id).length; cache.delete(id); }
  cache.set(id, buf); cacheBytes += buf.length;
  while (cacheBytes > CACHE_MAX && cache.size) { const [k, v] = cache.entries().next().value; cache.delete(k); cacheBytes -= v.length; }
}

const key = () => crypto.createHash('sha256').update(`xyron-files:${SECRET()}`).digest();
function encrypt(buf) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
function decrypt(buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

async function api(method, body, isForm = false, tries = 4) {
  for (let i = 1; ; i++) {
    const res = await fetch(`${BASE()}/bot${TOKEN()}/${method}`, {
      method: 'POST', headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body || {}), signal: AbortSignal.timeout(60000),
    });
    const j = await res.json().catch(() => ({}));
    if (j.ok) return j.result;
    const wait = Number(j.parameters?.retry_after);
    if (res.status === 429 && wait && i < tries) { await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000)); continue; }
    throw new Error(`Telegram ${method} failed: ${j.description || res.status}`);
  }
}

// Stores the bytes in Telegram. Throws when it cannot (the caller then falls back to R2 / Postgres).
export async function tgFilesPut(id, buf, mime = 'application/octet-stream') {
  const map = getMap(); if (!map) throw new Error('Telegram file store is not bound to the database');
  const enc = Boolean(SECRET());
  const payload = enc ? encrypt(buf) : buf;
  if (payload.length > GET_LIMIT - 1024) throw new Error('File is over 20 MB, which bots cannot download back');
  const form = new FormData();
  form.append('chat_id', CHAT());
  form.append('disable_notification', 'true');
  form.append('caption', `xyron-file ${id}`);
  form.append('document', new Blob([payload], { type: enc ? 'application/octet-stream' : mime }), `${id}.bin`);
  const msg = await api('sendDocument', form, true);
  const fileId = msg?.document?.file_id;
  if (!fileId) throw new Error('Telegram did not return a file id');
  map[id] = { f: fileId, m: msg.message_id, e: enc ? 1 : 0 };
  cacheSet(id, buf);
}

// Returns the bytes, or null when this id is not in Telegram (or Telegram cannot give it back right now).
export async function tgFilesGet(id) {
  const e = getMap()?.[id]; if (!e || !tgFilesEnabled()) return null;
  const hit = cacheGet(id); if (hit) return hit;
  try {
    const file = await api('getFile', { file_id: e.f });
    const res = await fetch(`${BASE()}/file/bot${TOKEN()}/${file.file_path}`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    let buf = Buffer.from(await res.arrayBuffer());
    if (e.e) { if (!SECRET()) throw new Error('file is encrypted but TELEGRAM_FILES_KEY is not set'); buf = decrypt(buf); }
    cacheSet(id, buf);
    return buf;
  } catch (err) { console.error('Telegram file read failed:', err.message); return null; }
}

// Forgets the file and tries to delete its message (best effort: Telegram may refuse for old messages).
export async function tgFilesDelete(id) {
  const map = getMap(), e = map?.[id]; if (!e) return;
  if (cache.has(id)) { cacheBytes -= cache.get(id).length; cache.delete(id); }
  delete map[id];
  if (!tgFilesEnabled()) return;
  try { await api('deleteMessage', { chat_id: CHAT(), message_id: e.m }, false, 1); }
  catch (err) { console.error('Telegram file message not deleted:', err.message); }
}

export async function tgFilesStatus() {
  const out = { enabled: tgFilesEnabled(), encrypted: Boolean(SECRET()), files: tgFilesCount(), cache_mb: +(cacheBytes / 1048576).toFixed(1) };
  if (!out.enabled) return out;
  try { const me = await api('getMe', {}, false, 1); out.bot = me.username; } catch (e) { out.error = e.message; return out; }
  try { const chat = await api('getChat', { chat_id: CHAT() }, false, 1); out.chat = chat.title || chat.username || String(chat.id); } catch (e) { out.error = `channel: ${e.message}`; }
  return out;
}

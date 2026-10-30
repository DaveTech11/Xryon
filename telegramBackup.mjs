// Free database backups in Telegram.
//
// Env vars (all on Render):
//   TELEGRAM_BACKUP_BOT_TOKEN  token from @BotFather
//   TELEGRAM_BACKUP_CHAT_ID    id of a PRIVATE chat with the bot (or a private channel the bot admins)
//   BACKUP_EVERY_HOURS         optional, default 24 (0 turns the schedule off; manual backups still work)
//
// What happens:
//  - The whole app state (users, chats, messages, code files, settings...) is gzipped and sent to Telegram
//    as a document, then pinned. A backup is skipped when nothing changed since the last one.
//  - Login sessions and one-time tokens are left out (smaller file, and nobody stays logged in from a leaked file).
//  - If the database comes up EMPTY (new Neon database, expired Render database), the server downloads the
//    pinned backup and restores it by itself.
//  - Telegram bots can download files up to 20 MB, so restore works for backups up to that size. Backups
//    up to 49 MB can still be sent and restored by hand. Uploaded files that live in Cloudflare R2 are not
//    part of the backup (R2 keeps them).
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const TOKEN = () => (process.env.TELEGRAM_BACKUP_BOT_TOKEN || '').trim();
const CHAT = () => (process.env.TELEGRAM_BACKUP_CHAT_ID || '').trim();
export const tgBackupConfigured = () => Boolean(TOKEN() && CHAT());

const SKIP_KEYS = ['sessions', 'emailCodes', 'passwordResets', 'signupTokens', 'fileTokens', 'usage'];
const SEND_LIMIT = 49 * 1024 * 1024;
const GET_LIMIT = 20 * 1024 * 1024;

const status = { lastOk: null, lastError: null, lastBytes: 0, lastHash: '', lastReason: '' };
export const tgBackupStatus = () => ({ configured: tgBackupConfigured(), ...status, lastHash: undefined });

async function api(method, body, isForm = false) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body || {}),
    signal: AbortSignal.timeout(60000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method} failed: ${j.description || res.status}`);
  return j.result;
}

function snapshot(db) {
  const copy = { ...db };
  for (const k of SKIP_KEYS) copy[k] = [];
  delete copy.__vapidNew;
  return copy;
}

const countsLine = (db) => `users ${db.users?.length || 0}, chats ${db.conversations?.length || 0}, messages ${db.messages?.length || 0}, code files ${db.codeFiles?.length || 0}`;

// force=true sends even when nothing changed.
export async function tgBackupNow(db, { reason = 'scheduled', force = false, pin = true } = {}) {
  if (!tgBackupConfigured()) throw new Error('Telegram backup is not configured (TELEGRAM_BACKUP_BOT_TOKEN / TELEGRAM_BACKUP_CHAT_ID).');
  try {
    // Never let an empty database (for example a failed restore) bury the good pinned backup.
    if (!force && !(db.users?.length > 0)) return { ok: true, skipped: true, reason: 'database has no users yet' };
    const json = JSON.stringify(snapshot(db));
    const hash = crypto.createHash('sha256').update(json).digest('hex');
    if (!force && hash === status.lastHash) return { ok: true, skipped: true, reason: 'nothing changed' };
    const gz = await gzip(Buffer.from(json), { level: 9 });
    if (gz.length > SEND_LIMIT) throw new Error(`Backup is ${(gz.length / 1048576).toFixed(1)} MB, over Telegram's 50 MB limit.`);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const form = new FormData();
    form.append('chat_id', CHAT());
    form.append('caption', `Xyron backup (${reason})\n${countsLine(db)}\n${(gz.length / 1024).toFixed(0)} KB`);
    form.append('disable_notification', 'true');
    form.append('document', new Blob([gz], { type: 'application/gzip' }), `xyron-backup-${stamp}.json.gz`);
    const msg = await api('sendDocument', form, true);
    // Pinning lets a fresh server find the newest backup with no database at all. Best effort.
    if (pin) try { await api('pinChatMessage', { chat_id: CHAT(), message_id: msg.message_id, disable_notification: true }); }
    catch (e) { console.error('[backup] could not pin the backup (restore will not find it automatically):', e.message); }
    Object.assign(status, { lastOk: new Date().toISOString(), lastError: null, lastBytes: gz.length, lastHash: hash, lastReason: reason });
    console.log(`[backup] sent to Telegram (${reason}): ${(gz.length / 1024).toFixed(0)} KB`);
    return { ok: true, bytes: gz.length, messageId: msg.message_id };
  } catch (e) {
    status.lastError = e.message;
    console.error('[backup] failed:', e.message);
    throw e;
  }
}

// Downloads the pinned backup. Returns the state object, or null when there is none.
export async function tgRestoreLatest() {
  if (!tgBackupConfigured()) return null;
  const chat = await api('getChat', { chat_id: CHAT() });
  const doc = chat.pinned_message?.document;
  if (!doc) return null;
  if (doc.file_size && doc.file_size > GET_LIMIT) throw new Error('The pinned backup is over 20 MB, which bots cannot download. Restore it by hand.');
  const file = await api('getFile', { file_id: doc.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN()}/${file.file_path}`, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Telegram file download failed (${res.status})`);
  const state = JSON.parse((await gunzip(Buffer.from(await res.arrayBuffer()))).toString('utf8'));
  if (!state || typeof state !== 'object' || !Array.isArray(state.users)) throw new Error('The pinned file is not a Xyron backup.');
  return state;
}

// Schedules backups. getDb returns the live state object.
export function startTgBackups(getDb) {
  if (!tgBackupConfigured()) return;
  const hours = Number(process.env.BACKUP_EVERY_HOURS ?? 24);
  console.log(`[backup] Telegram backups ${hours > 0 ? `every ${hours}h` : 'schedule off (manual only)'}`);
  if (!(hours > 0)) return;
  const run = (reason) => tgBackupNow(getDb(), { reason }).catch(() => {});
  setTimeout(() => run('startup'), 2 * 60 * 1000).unref?.();
  setInterval(() => run('scheduled'), hours * 3600 * 1000).unref?.();
}

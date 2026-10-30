// Persistent storage for Xyron.
//
// DATABASE_URL        = main Postgres (Render).
// SUPABASE_DB_URL     = optional second Postgres (Supabase) that is kept as a live mirror.
//
// How it behaves:
//  - Every save of the app state and every uploaded file is written to BOTH databases.
//  - On every boot the newest copy of the state wins and is copied to the other database,
//    and any file that exists in only one database is copied to the other one.
//    So if the Render database expires or is replaced, the first deploy with a fresh
//    DATABASE_URL restores everything from Supabase into it automatically.
//  - If the Render database is unreachable (expired), the server keeps running on Supabase alone
//    and keeps retrying the Render one in the background.
//  - With neither URL set the server falls back to the local data/xyron.json file (local dev).

import { r2Enabled, r2Put, r2Get, r2Delete } from './r2.mjs';
import { tgFilesEnabled, tgFilesPut, tgFilesGet, tgFilesDelete, tgFilesHas } from './tgfiles.mjs';

const PRIMARY_URL = (process.env.DATABASE_URL || '').trim();
const BACKUP_URL = (process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL || '').trim();

export const usingPg = Boolean(PRIMARY_URL || BACKUP_URL);

const targets = [
  PRIMARY_URL && { label: 'render', url: PRIMARY_URL },
  BACKUP_URL && { label: 'supabase', url: BACKUP_URL },
].filter(Boolean).map((t) => ({ ...t, pool: null, up: false }));

let chain = Promise.resolve();

function sslFor(urlStr) {
  if (process.env.PGSSLMODE === 'disable') return false;
  const host = new URL(urlStr).hostname;
  // Render's internal URL (host without a dot) and localhost don't use SSL; Render external and Supabase do.
  const local = host === 'localhost' || host === '127.0.0.1' || !host.includes('.');
  return local ? false : { rejectUnauthorized: false };
}

async function connect(t) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: t.url, ssl: sslFor(t.url), max: 5, connectionTimeoutMillis: 10000 });
  pool.on('error', (e) => console.error(`Postgres (${t.label}) pool error:`, e.message));
  try {
    await pool.query(`create table if not exists xyron_state (
      id int primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )`);
    await pool.query(`create table if not exists xyron_files (
      id text primary key,
      data bytea not null,
      created_at timestamptz not null default now()
    )`);
  } catch (e) {
    pool.end().catch(() => {});
    throw e;
  }
  t.pool = pool;
  t.up = true;
}

const errText = (e) => e?.code || e?.errors?.[0]?.code || e?.message || String(e);
const live = () => targets.filter((t) => t.up);

export async function storeInit() {
  if (!usingPg) return;
  await Promise.all(targets.map(async (t) => {
    try { await connect(t); console.log(`Postgres (${t.label}): connected`); }
    catch (e) { console.error(`Postgres (${t.label}) unavailable: ${errText(e)}`); }
  }));
  // Nothing reachable at all: throw so the server's start-up loop retries.
  if (!live().length) throw new Error('No Postgres database reachable');
  // A database that was down (for example an expired Render DB) is retried in the background.
  for (const t of targets.filter((x) => !x.up)) reviveLater(t);
}

function reviveLater(t) {
  const timer = setTimeout(async () => {
    try {
      await connect(t);
      console.log(`Postgres (${t.label}): reconnected, syncing`);
      await syncAll().catch((e) => console.error('Postgres sync error:', e.message));
    } catch { reviveLater(t); }
  }, 60000);
  timer.unref?.();
}

// Returns the newest saved state object, or null if nothing has been saved yet.
// Also copies it to the other database and starts a background file sync.
export async function storeLoad() {
  if (!usingPg) return null;
  const found = [];
  for (const t of live()) {
    try {
      const r = await t.pool.query('select data, updated_at from xyron_state where id = 1');
      if (r.rows[0]) found.push({ t, data: r.rows[0].data, at: new Date(r.rows[0].updated_at).getTime() });
    } catch (e) { console.error(`Postgres (${t.label}) read failed: ${errText(e)}`); }
  }
  found.sort((a, b) => b.at - a.at);
  const best = found[0] || null;
  if (best) {
    for (const t of live()) {
      if (t === best.t) continue;
      const mine = found.find((f) => f.t === t);
      if (mine && mine.at >= best.at) continue;
      try {
        await writeState(t, JSON.stringify(best.data));
        console.log(`Postgres: state copied ${best.t.label} -> ${t.label}`);
      } catch (e) { console.error(`Postgres copy to ${t.label} failed: ${errText(e)}`); }
    }
  }
  syncFiles().catch((e) => console.error('Postgres file sync error:', e.message));
  return best ? best.data : null;
}

const writeState = (t, json) => t.pool.query(
  `insert into xyron_state (id, data) values (1, $1::jsonb)
   on conflict (id) do update set data = excluded.data, updated_at = now()`,
  [json]
);

async function syncAll() {
  const found = [];
  for (const t of live()) {
    try {
      const r = await t.pool.query('select data, updated_at from xyron_state where id = 1');
      if (r.rows[0]) found.push({ t, data: r.rows[0].data, at: new Date(r.rows[0].updated_at).getTime() });
    } catch {}
  }
  found.sort((a, b) => b.at - a.at);
  if (found[0]) {
    for (const t of live()) {
      const mine = found.find((f) => f.t === t);
      if (t !== found[0].t && (!mine || mine.at < found[0].at)) await writeState(t, JSON.stringify(found[0].data));
    }
  }
  await syncFiles();
}

// Copy files that exist in only one database to the other (both directions, one at a time).
let syncing = false;
async function syncFiles() {
  const dbs = live();
  if (dbs.length < 2 || syncing) return;
  syncing = true;
  try {
    const ids = new Map();
    for (const t of dbs) ids.set(t, new Set((await t.pool.query('select id from xyron_files')).rows.map((r) => r.id)));
    let copied = 0;
    for (const from of dbs) {
      for (const to of dbs) {
        if (from === to) continue;
        for (const id of ids.get(from)) {
          if (ids.get(to).has(id)) continue;
          const r = await from.pool.query('select data from xyron_files where id = $1', [id]);
          if (!r.rows[0]) continue;
          await to.pool.query('insert into xyron_files (id, data) values ($1, $2) on conflict (id) do nothing', [id, r.rows[0].data]);
          ids.get(to).add(id);
          copied++;
        }
      }
    }
    if (copied) console.log(`Postgres: ${copied} file(s) copied between databases`);
  } finally { syncing = false; }
}

// Saves are queued so two quick writes can never land out of order.
// The first reachable database (normally Render) is written and awaited. Every other one (the Supabase
// mirror) is written in the background, newest state only, so a slow mirror never delays a chat reply.
// If the first database fails, the next one is awaited instead, so a save still only succeeds when
// at least one database really has the data.
const mirrors = new Map(); // target -> { running, latest }
const mirrorJobs = new Set();
function mirrorWrite(t, json) {
  let m = mirrors.get(t);
  if (!m) { m = { running: false, latest: null }; mirrors.set(t, m); }
  m.latest = json;
  if (m.running) return;
  m.running = true;
  const job = (async () => {
    while (m.latest !== null) {
      const j = m.latest; m.latest = null;
      try { await writeState(t, j); } catch (e) { console.error(`Postgres (${t.label}) mirror save failed: ${errText(e)}`); }
    }
    m.running = false;
  })();
  mirrorJobs.add(job);
  job.finally(() => mirrorJobs.delete(job));
}
// Waits until background mirror writes are done (used on shutdown).
export const storeIdle = () => Promise.allSettled([...mirrorJobs]);

export function storeSave(state) {
  const json = JSON.stringify(state);
  chain = chain.catch(() => {}).then(async () => {
    let ok = false;
    for (const t of live()) {
      if (ok) { mirrorWrite(t, json); continue; }
      try { await writeState(t, json); ok = true; }
      catch (e) { console.error(`Postgres (${t.label}) save failed: ${errText(e)}`); }
    }
    if (!ok) throw new Error('State could not be saved to any database');
  });
  return chain;
}

export async function storeFilePut(id, buf, mime) {
  // Telegram channel first when configured (see tgfiles.mjs); any failure falls through to R2 / Postgres so uploads never fail.
  if (tgFilesEnabled()) {
    try { await tgFilesPut(id, buf, mime); return; }
    catch (e) { console.error('Telegram file save failed, using the next store:', e.message); }
  }
  // With R2 configured, new files go to Cloudflare R2 and stay out of Postgres (saves database space).
  // If R2 is briefly unreachable, the file falls back to Postgres so the upload never fails.
  if (r2Enabled) {
    try { await r2Put(id, buf, mime || 'application/octet-stream'); return; }
    catch (e) { console.error('R2 file save failed, using Postgres:', e.message); }
  }
  const dbs = live();
  const results = await Promise.allSettled(dbs.map((t) => t.pool.query(
    'insert into xyron_files (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data',
    [id, buf]
  )));
  results.forEach((r, i) => { if (r.status === 'rejected') console.error(`Postgres (${dbs[i].label}) file save failed: ${errText(r.reason)}`); });
  if (!results.some((r) => r.status === 'fulfilled')) throw new Error('File could not be saved to any database');
}

export async function storeFileGet(id) {
  if (tgFilesHas(id)) { const b = await tgFilesGet(id); if (b) return b; }
  if (r2Enabled) {
    try { const b = await r2Get(id); if (b) return b; }
    catch (e) { console.error('R2 file read failed, trying Postgres:', e.message); }
  }
  for (const t of live()) {
    try {
      const r = await t.pool.query('select data from xyron_files where id = $1', [id]);
      if (r.rows[0]?.data) return r.rows[0].data;
    } catch (e) { console.error(`Postgres (${t.label}) file read failed: ${errText(e)}`); }
  }
  return null;
}

// Removes a file's bytes everywhere they may live (R2 and every Postgres copy).
export async function storeFileDelete(id) {
  try { await tgFilesDelete(id); } catch (e) { console.error('Telegram file delete failed:', e.message); }
  if (r2Enabled) { try { await r2Delete(id); } catch (e) { console.error('R2 file delete failed:', e.message); } }
  for (const t of live()) {
    try { await t.pool.query('delete from xyron_files where id = $1', [id]); }
    catch (e) { console.error(`Postgres (${t.label}) file delete failed: ${errText(e)}`); }
  }
}

// How much room things really take inside each Postgres database (bytes).
export async function storeUsage() {
  const out = [];
  for (const t of live()) {
    try {
      const r = await t.pool.query(`select
        (select coalesce(sum(octet_length(data)),0) from xyron_files)::bigint as files_bytes,
        (select count(*) from xyron_files)::bigint as files_count,
        (select coalesce(octet_length(data::text),0) from xyron_state where id = 1)::bigint as state_bytes,
        pg_database_size(current_database())::bigint as database_bytes`);
      const x = r.rows[0];
      out.push({ database: t.label, files_in_postgres_mb: Math.round(Number(x.files_bytes) / 1048576), files_in_postgres_count: Number(x.files_count), state_json_mb: +(Number(x.state_bytes) / 1048576).toFixed(2), database_total_mb: Math.round(Number(x.database_bytes) / 1048576) });
    } catch (e) { out.push({ database: t.label, error: errText(e) }); }
  }
  return out;
}

// Deleting rows only makes room that Postgres reuses; the database file does not get smaller until a VACUUM FULL.
// It briefly locks the files table, so it is only run when asked for.
export async function storeVacuum() {
  const done = [];
  for (const t of live()) {
    try { await t.pool.query('vacuum full xyron_files'); done.push(t.label); }
    catch (e) { console.error(`Postgres (${t.label}) vacuum failed: ${errText(e)}`); }
  }
  return done;
}

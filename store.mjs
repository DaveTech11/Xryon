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
export function storeSave(state) {
  const json = JSON.stringify(state);
  chain = chain.catch(() => {}).then(async () => {
    const dbs = live();
    const results = await Promise.allSettled(dbs.map((t) => writeState(t, json)));
    results.forEach((r, i) => { if (r.status === 'rejected') console.error(`Postgres (${dbs[i].label}) save failed: ${errText(r.reason)}`); });
    if (!results.some((r) => r.status === 'fulfilled')) throw new Error('State could not be saved to any database');
  });
  return chain;
}

export async function storeFilePut(id, buf) {
  const dbs = live();
  const results = await Promise.allSettled(dbs.map((t) => t.pool.query(
    'insert into xyron_files (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data',
    [id, buf]
  )));
  results.forEach((r, i) => { if (r.status === 'rejected') console.error(`Postgres (${dbs[i].label}) file save failed: ${errText(r.reason)}`); });
  if (!results.some((r) => r.status === 'fulfilled')) throw new Error('File could not be saved to any database');
}

export async function storeFileGet(id) {
  for (const t of live()) {
    try {
      const r = await t.pool.query('select data from xyron_files where id = $1', [id]);
      if (r.rows[0]?.data) return r.rows[0].data;
    } catch (e) { console.error(`Postgres (${t.label}) file read failed: ${errText(e)}`); }
  }
  return null;
}

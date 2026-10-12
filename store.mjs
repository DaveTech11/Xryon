// Persistent storage for Xyron.
//
// With DATABASE_URL set (Render PostgreSQL) the whole app state is kept in a
// JSONB row and uploaded files are kept as bytea, so nothing is lost when the
// server redeploys or restarts. Without DATABASE_URL the server falls back to
// the local data/xyron.json file exactly as before (handy for local dev).

export const usingPg = Boolean(process.env.DATABASE_URL);

let pool = null;
let chain = Promise.resolve();

export async function storeInit() {
  if (!usingPg) return;
  const { default: pg } = await import('pg');
  const url = new URL(process.env.DATABASE_URL);
  // Render's external URL needs SSL; the internal one (host without a dot) and localhost don't.
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || !url.hostname.includes('.');
  const ssl = process.env.PGSSLMODE === 'disable' || local ? false : { rejectUnauthorized: false };
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 5 });
  pool.on('error', (e) => console.error('Postgres pool error:', e.message));
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
}

// Returns the saved state object, or null if nothing has been saved yet.
export async function storeLoad() {
  if (!usingPg) return null;
  const r = await pool.query('select data from xyron_state where id = 1');
  return r.rows[0]?.data || null;
}

// Saves are queued so two quick writes can never land out of order.
export function storeSave(state) {
  const json = JSON.stringify(state);
  chain = chain.catch(() => {}).then(() =>
    pool.query(
      `insert into xyron_state (id, data) values (1, $1::jsonb)
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [json]
    )
  );
  return chain;
}

export async function storeFilePut(id, buf) {
  await pool.query(
    'insert into xyron_files (id, data) values ($1, $2) on conflict (id) do update set data = excluded.data',
    [id, buf]
  );
}

export async function storeFileGet(id) {
  const r = await pool.query('select data from xyron_files where id = $1', [id]);
  return r.rows[0]?.data || null;
}

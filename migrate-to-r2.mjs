// One-off: copies every file stored in Postgres into Cloudflare R2.
// Run on your host (or locally with the same env vars):  node migrate-to-r2.mjs
// Add --delete to remove each file from Postgres after it is safely in R2 (frees database space).
import { r2Enabled, r2Put, r2Has } from './r2.mjs';
import pg from 'pg';
if (!r2Enabled) { console.error('Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET first.'); process.exit(1); }
try { process.loadEnvFile?.('.env'); } catch {}
const del = process.argv.includes('--delete');
const urls = [process.env.DATABASE_URL, process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL].filter(Boolean);
if (!urls.length) { console.error('No DATABASE_URL set.'); process.exit(1); }
let moved = 0, skipped = 0, failed = 0;
for (const url of urls) {
  const host = new URL(url).hostname;
  const pool = new pg.Pool({ connectionString: url, ssl: host === 'localhost' || !host.includes('.') ? false : { rejectUnauthorized: false } });
  const ids = (await pool.query('select id from xyron_files')).rows.map((r) => r.id);
  console.log(`${host}: ${ids.length} file(s)`);
  for (const id of ids) {
    try {
      if (!(await r2Has(id))) {
        const r = await pool.query('select data from xyron_files where id = $1', [id]);
        await r2Put(id, r.rows[0].data);
        moved++;
      } else skipped++;
      if (del) await pool.query('delete from xyron_files where id = $1', [id]);
    } catch (e) { failed++; console.error(`  ${id}: ${e.message}`); }
  }
  await pool.end();
}
console.log(`Done. moved ${moved}, already in R2 ${skipped}, failed ${failed}.`);

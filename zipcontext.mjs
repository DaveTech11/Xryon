// Lets the chat AI "see inside" a .zip project the person attached.
// Returns a compact text digest: the file tree plus the contents of the most important text files,
// within a size budget. Anything that is not a zip returns null.

const SKIP_DIR = /(^|\/)(node_modules|\.git|\.next|\.nuxt|dist|build|out|coverage|__pycache__|\.venv|venv|\.idea|\.vscode|target|vendor|\.cache|\.parcel-cache)(\/|$)/i;
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|\.DS_Store|Thumbs\.db)$/i;
const TEXT_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|json|md|txt|html?|css|scss|sass|less|py|rb|php|java|kt|go|rs|c|h|cpp|cs|sh|bat|ps1|yml|yaml|toml|ini|cfg|conf|env|example|sql|xml|svg|vue|svelte|ejs|hbs|graphql|prisma|dockerfile|gitignore|npmrc|lock)$/i;
const NAMED_TEXT = /(^|\/)(Dockerfile|Procfile|Makefile|README|LICENSE|\.env\.example|\.gitignore|\.npmrc)$/i;
const PRIORITY = [/(^|\/)package\.json$/i, /(^|\/)readme(\.md)?$/i, /(^|\/)(index|main|app|bot|server)\.(m?js|ts|py)$/i, /(^|\/)\.env\.example$/i, /config/i, /(^|\/)src\//i];

export const isZipBytes = (b) => !!b && b.length > 22 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) ;

const cache = new Map(); // key -> digest

export async function zipContext(bytes, cacheKey = '') {
  if (!isZipBytes(bytes)) return null;
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);
  let JSZip;
  try { JSZip = (await import('jszip')).default; } catch { return null; }
  let zip;
  try { zip = await JSZip.loadAsync(bytes); } catch { return null; }

  const BUDGET = Number(process.env.ZIP_CONTEXT_CHARS) || 60000;
  const PER_FILE = Number(process.env.ZIP_CONTEXT_FILE_CHARS) || 9000;
  const MAX_READ_BYTES = 25 * 1024 * 1024; // zip-bomb guard
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !SKIP_DIR.test(n) && !SKIP_FILE.test(n) && !/(^|\/)__MACOSX\//.test(n)).slice(0, 1500);

  const score = (n) => {
    const i = PRIORITY.findIndex((re) => re.test(n));
    return (i === -1 ? PRIORITY.length : i) * 100 + n.split('/').length;
  };
  const textual = names.filter((n) => TEXT_EXT.test(n) || NAMED_TEXT.test(n)).sort((a, b) => score(a) - score(b) || a.localeCompare(b));

  let used = 0, readBytes = 0;
  const parts = [];
  const included = new Set();
  for (const n of textual) {
    if (used >= BUDGET || readBytes >= MAX_READ_BYTES) break;
    let buf;
    try { buf = await zip.files[n].async('uint8array'); } catch { continue; }
    readBytes += buf.length;
    if (buf.length > 400 * 1024) continue;
    let text = Buffer.from(buf).toString('utf8');
    if (text.includes('\u0000')) continue;
    let note = '';
    if (text.length > PER_FILE) { text = text.slice(0, PER_FILE); note = '\n…[file truncated]'; }
    if (used + text.length > BUDGET) { text = text.slice(0, Math.max(0, BUDGET - used)); note = '\n…[budget reached, file truncated]'; }
    if (!text) break;
    used += text.length;
    included.add(n);
    parts.push(`### ${n}\n\`\`\`\n${text}${note}\n\`\`\``);
  }

  const tree = names.map((n) => `${n}${included.has(n) ? '' : '  (not shown)'}`).join('\n');
  const digest =
    `FILES IN THE ZIP (${names.length}, junk like node_modules/.git hidden):\n${tree}\n\n` +
    `CONTENTS OF THE KEY FILES:\n\n${parts.join('\n\n')}`;
  if (cacheKey) { cache.set(cacheKey, digest); if (cache.size > 30) cache.delete(cache.keys().next().value); }
  return digest;
}

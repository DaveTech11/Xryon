// File reader for the chat: turns an attached document (txt, code, csv, json, pdf, docx, xlsx, pptx ...) into plain text
// so the chat AI can answer questions about it. Images go to the vision model instead; ZIP projects go through zipcontext.mjs.
// Returns { text, truncated, kind } or null when the file cannot be read as text.
import { isZipBytes } from './zipcontext.mjs';

const MAX_CHARS = Number(process.env.DOC_CONTEXT_CHARS) || 40000;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|log|xml|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|py|rb|php|java|kt|go|rs|c|h|cpp|cs|sh|bat|ps1|ya?ml|toml|ini|cfg|conf|env|sql|vue|svelte|lua|r|swift|dart|rtf|srt|vtt)$/i;

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const looksBinary = (b) => { const n = Math.min(b.length, 4000); let bad = 0; for (let i = 0; i < n; i++) if (b[i] === 0) bad++; return bad > 0; };

async function loadZip(bytes) { const JSZip = (await import('jszip')).default; return JSZip.loadAsync(bytes); }

async function readDocx(bytes) {
  const zip = await loadZip(bytes);
  const f = zip.file('word/document.xml'); if (!f) return '';
  const xml = await f.async('string');
  return decodeXml(xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<[^>]+>/g, ''));
}
async function readPptx(bytes) {
  const zip = await loadZip(bytes);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
  const out = [];
  for (const n of names) { const xml = await zip.files[n].async('string'); out.push(`--- Slide ${out.length + 1} ---\n` + decodeXml(xml.replace(/<\/a:p>/g, '\n').replace(/<[^>]+>/g, '')).trim()); }
  return out.join('\n\n');
}
async function readXlsx(bytes) {
  const zip = await loadZip(bytes);
  const sst = zip.file('xl/sharedStrings.xml');
  const strings = sst ? [...(await sst.async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decodeXml(m[1].replace(/<[^>]+>/g, ''))) : [];
  const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
  const out = [];
  for (const n of sheets) {
    const xml = await zip.files[n].async('string');
    const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 2000).map((r) =>
      [...r[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
        const v = (c[2] || '').match(/<v>([\s\S]*?)<\/v>/); const isStr = /t="s"/.test(c[1]);
        const inl = (c[2] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/);
        return v ? (isStr ? strings[+v[1]] ?? '' : decodeXml(v[1])) : (inl ? decodeXml(inl[1]) : '');
      }).join('\t'));
    out.push(`--- Sheet ${out.length + 1} ---\n${rows.join('\n')}`);
  }
  return out.join('\n\n');
}
async function readPdf(bytes) {
  // 1) pdf-parse when installed  2) pdftotext when the server has it
  try { const mod = await import('pdf-parse'); const fn = mod.default || mod; const r = await fn(Buffer.from(bytes)); if (r?.text?.trim()) return r.text; } catch { /* try next */ }
  try {
    const { execFile } = await import('node:child_process'); const { writeFile, readFile, rm, mkdtemp } = await import('node:fs/promises'); const os = await import('node:os'); const path = await import('node:path');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pdf-')); const f = path.join(dir, 'in.pdf');
    await writeFile(f, bytes);
    const text = await new Promise((res) => execFile('pdftotext', ['-layout', f, '-'], { maxBuffer: 20 * 1024 * 1024, timeout: 30000 }, (e, so) => res(e ? '' : so)));
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return text;
  } catch { return ''; }
}

export async function readDocument(bytes, name = '', mime = '') {
  if (!bytes || !bytes.length) return null;
  const n = String(name || ''); let text = '', kind = 'text';
  try {
    if (/\.pdf$/i.test(n) || mime === 'application/pdf' || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) { kind = 'pdf'; text = await readPdf(bytes); }
    else if (isZipBytes(bytes) && /\.docx$/i.test(n)) { kind = 'docx'; text = await readDocx(bytes); }
    else if (isZipBytes(bytes) && /\.pptx$/i.test(n)) { kind = 'pptx'; text = await readPptx(bytes); }
    else if (isZipBytes(bytes) && /\.xlsx$/i.test(n)) { kind = 'xlsx'; text = await readXlsx(bytes); }
    else if (isZipBytes(bytes)) return null; // a project ZIP: handled by zipcontext.mjs
    else if (TEXT_EXT.test(n) || /^text\//.test(mime) || /json|xml|javascript/.test(mime) || !looksBinary(bytes)) { if (looksBinary(bytes)) return null; text = Buffer.from(bytes).toString('utf8'); }
    else return null;
  } catch (e) { return { text: '', truncated: false, kind, error: e.message }; }
  text = String(text || '').replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated, kind };
}

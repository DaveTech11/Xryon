// Downloads something a person pointed at on GitHub so REA can study it: a whole repo (ZIP), a branch/folder link, one file (blob / raw link),
// a release download (.apk, .exe, .zip ...) or an /archive/ link. Public GitHub only.
// Safety: the address is REBUILT from owner/repo/ref/path (never fetched as typed), every redirect hop must stay on a GitHub download host,
// https only, and the download is capped (default 60 MB) while it streams. Nothing is executed.
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const OK_HOSTS = /^(github\.com|codeload\.github\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com|github-releases\.githubusercontent\.com)$/i;
export const GH_MAX_BYTES = 60 * 1024 * 1024;

const seg = (s) => String(s).split('/').map(encodeURIComponent).join('/');
const safePath = (p) => !!p && !p.split('/').some((x) => x === '..' || x === '');

/** Finds the first GitHub link in `text`. With {bare:true} a lone "owner/name" also counts. Returns null when there is none. */
export function parseGithubUrl(text = '', { bare = false } = {}) {
  const s = String(text).trim();
  let m;
  if (bare && (m = /^([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(s)) && !/^https?:/i.test(s)) {
    return { kind: 'repo', owner: m[1], repo: m[2], ref: 'HEAD' };
  }
  const u = /(?:https?:\/\/)?(?:www\.)?((?:github\.com|raw\.githubusercontent\.com)\/[^\s<>"'`)\]]+)/i.exec(s);
  if (!u) return null;
  let url;
  try { url = new URL('https://' + u[1].replace(/[.,;:!?]+$/, '')); } catch { return null; }
  let parts;
  try { parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { return null; }
  if (url.hostname.toLowerCase() === 'raw.githubusercontent.com') {
    if (parts.length < 4) return null;
    const [owner, repo, ref, ...rest] = parts;
    const path = rest.join('/');
    return NAME.test(owner) && NAME.test(repo) && safePath(path) ? { kind: 'file', owner, repo, ref, path } : null;
  }
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!NAME.test(owner) || !NAME.test(repo)) return null;
  const [type, ...rest] = parts.slice(2);
  if (type === 'tree' && rest.length) return { kind: 'repo', owner, repo, ref: rest.join('/') };
  if ((type === 'blob' || type === 'raw') && rest.length >= 2) {
    const path = rest.slice(1).join('/');
    return safePath(path) ? { kind: 'file', owner, repo, ref: rest[0], path } : null;
  }
  if (type === 'releases' && rest[0] === 'download' && rest.length >= 3) return { kind: 'asset', owner, repo, tag: rest[1], asset: rest.slice(2).join('/') };
  if (type === 'archive' && rest.length && safePath(rest.join('/'))) return { kind: 'archive', owner, repo, path: rest.join('/') };
  return { kind: 'repo', owner, repo, ref: 'HEAD' };
}

function targetUrl(g) {
  const o = encodeURIComponent(g.owner), r = encodeURIComponent(g.repo);
  if (g.kind === 'repo') return { url: `https://codeload.github.com/${o}/${r}/zip/${seg(g.ref || 'HEAD')}`, name: `${g.repo}.zip` };
  if (g.kind === 'file') return { url: `https://raw.githubusercontent.com/${o}/${r}/${seg(g.ref)}/${seg(g.path)}`, name: g.path.split('/').pop() };
  if (g.kind === 'asset') return { url: `https://github.com/${o}/${r}/releases/download/${encodeURIComponent(g.tag)}/${seg(g.asset)}`, name: g.asset.split('/').pop() };
  return { url: `https://github.com/${o}/${r}/archive/${seg(g.path)}`, name: g.path.split('/').pop() };
}

/** Downloads what parseGithubUrl found. Returns { bytes, name }. Throws an Error with a message that is safe to show the person. */
export async function fetchGithub(g, { maxBytes = GH_MAX_BYTES, timeoutMs = 90000, fetchImpl = fetch } = {}) {
  const t = targetUrl(g);
  let url = t.url;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop < 6; hop++) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !OK_HOSTS.test(u.hostname)) throw new Error('GitHub sent the download somewhere that is not allowed.');
    const r = await fetchImpl(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'xyron-rea' } });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const loc = r.headers.get('location');
      if (!loc) throw new Error('GitHub gave a broken redirect.');
      url = new URL(loc, url).toString();
      continue;
    }
    if (r.status === 404) throw new Error(g.kind === 'repo' ? 'That repo or branch was not found, or it is private. Only public GitHub links can be downloaded; for a private repo, download the ZIP and upload it.' : 'That file was not found on GitHub (check the link, branch and path), or the repo is private.');
    if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > maxBytes) throw new Error(`That is larger than ${Math.round(maxBytes / 1048576)} MB. Send a link to a smaller part or upload a trimmed ZIP.`);
    const chunks = []; let total = 0;
    for await (const c of r.body) {
      total += c.length;
      if (total > maxBytes) throw new Error(`That is larger than ${Math.round(maxBytes / 1048576)} MB. Send a link to a smaller part or upload a trimmed ZIP.`);
      chunks.push(c);
    }
    if (!total) throw new Error('GitHub returned an empty file.');
    return { bytes: Buffer.concat(chunks), name: t.name };
  }
  throw new Error('Too many redirects from GitHub.');
}

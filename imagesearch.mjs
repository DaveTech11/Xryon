// Image search for chat answers ("show me ... / wallpapers / outfits / places").
//
// Keys live ONLY in environment variables (.env) and are used here on the server; the browser
// never sees them and never talks to the providers. Providers are tried in this order and the
// first one that returns pictures wins:
//
//   PEXELS_API_KEY        https://www.pexels.com/api/        (free, high-quality photos)
//   UNSPLASH_ACCESS_KEY   https://unsplash.com/developers    (free, high-quality photos)
//   PIXABAY_API_KEY       https://pixabay.com/api/docs/      (free)
//   SERPAPI_KEY           https://serpapi.com/               (Google Images results)
//   (no key needed)       Openverse, then Wikimedia Commons  (works out of the box)
//
// Every result is normalised to:
//   { id, caption, thumb, full, width, height, source, credit, link }
// `thumb` / `full` are the provider's picture URLs; server.mjs wraps them in signed same-origin
// proxy links before they reach the browser.

const UA = 'XyronImageSearch/1.0 (+https://xyron.app)';
const TIMEOUT = Number(process.env.IMAGE_SEARCH_TIMEOUT_MS) || 9000;

const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const shorten = (s, n = 90) => { s = strip(s); if (s.length <= n) return s; const cut = s.slice(0, n).replace(/\s+\S*$/, ''); return (cut || s.slice(0, n)) + '…'; };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const httpsOnly = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.replace(/^http:/, 'https:') : ''; } catch { return ''; } };
const withUtm = (u) => { try { const x = new URL(u); x.searchParams.set('utm_source', 'xyron'); x.searchParams.set('utm_medium', 'referral'); return x.href; } catch { return u; } };

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function pexels(q, n, page = 1) {
  const j = await getJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}&page=${page}&size=large`, { Authorization: process.env.PEXELS_API_KEY });
  return (j.photos || []).map((p) => ({
    id: `pexels-${p.id}`, caption: shorten(p.alt || q), thumb: p.src?.large || p.src?.medium, full: p.src?.large2x || p.src?.original || p.src?.large,
    width: p.width, height: p.height, source: 'Pexels', credit: p.photographer || '', link: p.url,
  }));
}

async function unsplash(q, n, page = 1) {
  const j = await getJson(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${n}&page=${page}&content_filter=high`, { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` });
  return (j.results || []).map((p) => ({
    id: `unsplash-${p.id}`, caption: shorten(p.alt_description || p.description || q), thumb: p.urls?.small || p.urls?.regular, full: p.urls?.regular || p.urls?.full,
    width: p.width, height: p.height, source: 'Unsplash', credit: p.user?.name || '', link: withUtm(p.links?.html || 'https://unsplash.com'),
  }));
}

async function pixabay(q, n, page = 1) {
  const j = await getJson(`https://pixabay.com/api/?key=${encodeURIComponent(process.env.PIXABAY_API_KEY)}&q=${encodeURIComponent(q)}&image_type=photo&safesearch=true&per_page=${Math.max(3, n)}&page=${page}&order=popular`);
  return (j.hits || []).map((p) => ({
    id: `pixabay-${p.id}`, caption: shorten(cap(String(p.tags || q).split(',').slice(0, 3).join(', '))), thumb: p.webformatURL, full: p.largeImageURL || p.webformatURL,
    width: p.imageWidth, height: p.imageHeight, source: 'Pixabay', credit: p.user || '', link: p.pageURL,
  }));
}

async function serpapi(q, n, page = 1) {
  const j = await getJson(`https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(q)}&safe=active&start=${(page - 1) * 20}&api_key=${encodeURIComponent(process.env.SERPAPI_KEY)}`);
  return (j.images_results || []).slice(0, n * 2).map((p, i) => ({
    id: `serp-${p.position ?? i}-${(p.title || '').length}`, caption: shorten(p.title || q), thumb: p.thumbnail || p.original, full: p.original || p.thumbnail,
    width: p.original_width, height: p.original_height, source: p.source || 'Web', credit: '', link: p.link,
  }));
}

async function openverse(q, n, page = 1) {
  const j = await getJson(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${n * 2}&page=${page}&mature=false&category=photograph`);
  return (j.results || []).map((p) => ({
    id: `openverse-${p.id}`, caption: shorten(p.title || q), thumb: p.thumbnail || p.url, full: p.url || p.thumbnail,
    width: p.width, height: p.height, source: cap(p.source || 'Openverse'), credit: p.creator || '', link: p.foreign_landing_url || p.url,
  }));
}

async function wikimedia(q, n, page = 1) {
  const j = await getJson(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrlimit=${n * 2}&gsroffset=${(page - 1) * n * 2}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280&format=json&origin=*`);
  return Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map((pg) => {
    const ii = pg.imageinfo?.[0]; if (!ii) return null;
    const meta = ii.extmetadata || {};
    return {
      id: `wikimedia-${pg.pageid}`, caption: shorten(meta.ImageDescription?.value || String(pg.title || q).replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' ')),
      thumb: (ii.thumburl || ii.url).replace(/\/1280px-/, '/480px-'), full: ii.thumburl || ii.url, width: ii.width, height: ii.height, source: 'Wikimedia Commons', credit: shorten(meta.Artist?.value || '', 40), link: ii.descriptionurl,
    };
  }).filter(Boolean);
}

function providers() {
  const list = [];
  if (process.env.PEXELS_API_KEY) list.push(['pexels', pexels]);
  if (process.env.UNSPLASH_ACCESS_KEY) list.push(['unsplash', unsplash]);
  if (process.env.PIXABAY_API_KEY) list.push(['pixabay', pixabay]);
  if (process.env.SERPAPI_KEY) list.push(['serpapi', serpapi]);
  list.push(['openverse', openverse], ['wikimedia', wikimedia]);
  return list;
}

const cache = new Map(); // "q|n|page" -> { at, items }

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'on', 'for', 'with', 'at', 'to']);
const toks = (s) => (String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) || []).filter((w) => !STOPWORDS.has(w));
// Pictures that are not photos of the subject (logos, signatures, maps, book covers...).
const NOT_A_PHOTO = /\b(logo|signature|autograph|flag|map|diagram|chart|graph|cover|poster|stamp|coat of arms|screenshot|infographic)\b/i;

// How many of the search words show up in the picture's caption / title? (1 = all of them)
function overlap(item, qTokens) {
  if (!qTokens.length) return 0;
  const hay = new Set(toks(`${item.caption} ${item.link || ''}`.replace(/[_/.-]+/g, ' ')));
  return qTokens.filter((w) => hay.has(w)).length / qTokens.length;
}

function cleanItems(got, n) {
  const seen = new Set();
  const clean = got
    .map((x) => ({ ...x, thumb: httpsOnly(x.thumb), full: httpsOnly(x.full || x.thumb), link: httpsOnly(x.link) }))
    .filter((x) => x.thumb && x.full && !/\.(svg|gif|tiff?)(\?|$)/i.test(x.full) && !/\.(svg|gif|tiff?)(\?|$)/i.test(x.thumb))
    .filter((x) => { const k = x.full.split('?')[0]; if (seen.has(k)) return false; seen.add(k); return true; });
  // Prefer reasonably large pictures, but never end up with nothing.
  const big = clean.filter((x) => !x.width || x.width >= 600);
  return (big.length >= 3 ? big : clean).slice(0, n * 2);
}

// Returns up to `n` clean, de-duplicated results (never throws: [] when nothing could be found).
// `page` > 1 gives a different set ("show me more / another picture").
//
// Named subjects ("Elon Musk", "Eiffel Tower", "Lionel Messi"): stock sites (Pexels, Unsplash, Pixabay)
// only hold generic photos, so they answer a name with random unrelated pictures. So every provider is
// asked at once and the pictures are scored on whether the NAME is in their title; when Wikimedia Commons /
// Openverse hold at least three pictures that really carry the name and the stock sites don't, those win.
export async function searchImages(rawQuery, n = 8, page = 1) {
  const q = String(rawQuery || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (q.length < 2) return [];
  n = Math.max(3, Math.min(12, Number(n) || 8));
  page = Math.max(1, Math.min(10, Number(page) || 1));
  const key = `${q.toLowerCase()}|${n}|${page}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.items;

  const qTokens = toks(q);
  const list = providers();
  const settled = await Promise.all(list.map(async ([name, fn]) => {
    try { return [name, cleanItems(await fn(q, n, page), n)]; }
    catch (e) { console.error(`image search (${name}) failed:`, e.message); return [name, []]; }
  }));
  const byName = Object.fromEntries(settled);
  const stockNames = ['pexels', 'unsplash', 'pixabay', 'serpapi'];
  const stock = stockNames.flatMap((k) => byName[k] || []);
  const commons = ['wikimedia', 'openverse'].flatMap((k) => (byName[k] || []).filter((x) => !NOT_A_PHOTO.test(x.caption)));
  const strict = (arr) => arr.filter((x) => overlap(x, qTokens) === 1);
  let extra = null;

  let items;
  // Looks like a name (stock sites can't match all the words) -> use Commons pictures that carry the name.
  // Long queries ("Elon Musk business portrait suit") are tried with fewer words until pictures carry them all;
  // the leading words are the name, the rest only decides the order.
  let named = null;
  if (qTokens.length >= 2 && strict(stock).length < 3) {
    for (let k = qTokens.length; k >= 2 && !named; k--) {
      const head = qTokens.slice(0, k);
      let pool = commons;
      if (k < qTokens.length && !extra) {
        // Ask Wikimedia / Openverse again with just the name words.
        extra = await Promise.all(['wikimedia', 'openverse'].map(async (name) => {
          try { return await (name === 'wikimedia' ? wikimedia : openverse)(qTokens.slice(0, 2).join(' '), n, page); }
          catch (e) { console.error(`image search (${name}, name only) failed:`, e.message); return []; }
        }));
        extra = extra.flatMap((arr) => cleanItems(arr, n)).filter((x) => !NOT_A_PHOTO.test(x.caption));
      }
      if (k < qTokens.length && extra) pool = [...commons, ...extra];
      const seenIds = new Set();
      const hits = pool.filter((x) => overlap(x, head) === 1).filter((x) => !seenIds.has(x.id) && seenIds.add(x.id));
      if (hits.length >= 3) named = hits.map((x, i) => [x, i]).sort((p, q) => overlap(q[0], qTokens) - overlap(p[0], qTokens) || p[1] - q[1]).map(([x]) => x);
    }
  }
  if (named) {
    items = named.slice(0, Math.max(n, 6));
  } else {
    // Generic search: the first provider (in priority order) that returned pictures wins, as before.
    const first = list.map(([name]) => byName[name]).find((arr) => arr && arr.length);
    items = (first || []).slice(0, n);
  }
  cache.set(key, { at: Date.now(), items });
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return items;
}

// Fetches one picture's bytes for the same-origin proxy. Only real raster images, size-capped.
export async function fetchImageBytes(url, maxBytes = 12 * 1024 * 1024) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const mime = String(r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(mime)) throw new Error('not a supported image');
  const declared = Number(r.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('image too large');
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error('image too large');
  return { mime, bytes };
}

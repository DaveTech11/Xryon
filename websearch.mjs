// Live web search for chat answers ("Web search" toggle in the + menu).
//
// When the person turns it on, server.mjs searches the web for each question and hands the results
// to the AI as extra context, so answers about news, scores, prices, weather or "what is happening
// now" are based on pages from the last minutes instead of the model's old training data.
//
// Keys live ONLY in .env. Providers are tried in this order, the first that returns results wins:
//   TAVILY_API_KEY         https://tavily.com            (made for AI answers, free tier)
//   BRAVE_SEARCH_API_KEY   https://brave.com/search/api  (free tier)
//   SERPAPI_KEY            https://serpapi.com           (Google results; same key as image search)
//   (no key needed)        Google News RSS + DuckDuckGo  (works out of the box, less polished)
//
// Wikipedia is always searched too (with its picture and a short summary), and news articles are opened
// briefly to pick up their main picture (og:image) so the chat can show it next to the link.
//
// Every result is normalised to { title, url, snippet, date, source, image }. Nothing here throws:
// when nothing could be searched the caller gets { results: [], error } and tells the AI so.
import dns from 'node:dns/promises';
import net from 'node:net';

const UA = 'Mozilla/5.0 (compatible; XyronWebSearch/1.0; +https://xyron.app)';
const TIMEOUT = Number(process.env.WEB_SEARCH_TIMEOUT_MS) || 8000;
// Mistral includes web search, but must never delay Xyron's other search providers.
const MISTRAL_SEARCH_TIMEOUT = Number(process.env.MISTRAL_SEARCH_TIMEOUT_MS) || 4200;
const REGION = (process.env.WEB_SEARCH_REGION || 'NG').toUpperCase();

const strip = (s) => String(s ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();
const clip = (s, n) => { s = strip(s); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const httpUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };

const NEWSY = /\b(news|latest|today|tonight|yesterday|this (week|month|year)|breaking|current(ly)?|right now|now|score|scores|result|results|fixture|standings|price|prices|rate|rates|exchange|weather|forecast|update|updates|happening|trending|live|just|recent(ly)?|headline|headlines|election|stock|stocks|crypto|bitcoin)\b/i;
export const looksNewsy = (q) => NEWSY.test(q);

async function getText(url, headers = {}, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
async function getJson(url, headers = {}, opts = {}) {
  return JSON.parse(await getText(url, { Accept: 'application/json', ...headers }, opts));
}

// Prexzy's Mistral endpoint includes web search. It is the first-choice provider,
// but is strictly limited to 4.2 seconds by default; if it is slow/unavailable,
// webSearch continues to DuckDuckGo/Google News and any configured providers.
async function mistral(q, n, newsy) {
  const response = await fetch('https://prexzyapis.com/ai/mistral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      prompt: `Search the web for ${newsy ? 'recent/current news' : 'reliable web pages'} about: ${q}. Return concise findings and include source URLs.`,
      chatId: `xyron-web-${Buffer.from(q).toString('base64url').slice(0, 32)}`,
      session: 'xyron-web-search',
    }),
    signal: AbortSignal.timeout(MISTRAL_SEARCH_TIMEOUT),
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = { result: raw }; }
  if (!response.ok || data?.status === false || data?.success === false) {
    throw new Error(data?.error || data?.message || `Mistral search HTTP ${response.status}`);
  }
  // Prefer structured citations/results if this endpoint returns them.
  const candidates = [data?.results, data?.sources, data?.citations, data?.data?.results, data?.data?.sources, data?.data?.citations]
    .find(Array.isArray) || [];
  const structured = candidates.map((r) => ({
    title: r.title || r.name || r.url,
    url: r.url || r.link || r.href,
    snippet: r.snippet || r.description || r.content || r.text || '',
    date: r.date || r.published_date || '',
    source: r.source || host(r.url || r.link || r.href),
    image: r.image || r.thumbnail || '',
  })).filter((r) => r.title && r.url);
  if (structured.length) return structured.slice(0, n);

  // Some versions return a prose answer with Markdown links instead of a results array.
  const answer = [data?.result, data?.response, data?.answer, data?.text, data?.reply, data?.output,
    data?.data?.result, data?.data?.response, data?.data?.answer, data?.data?.text]
    .find((x) => typeof x === 'string' && x.trim()) || '';
  const linked = [];
  for (const m of String(answer).matchAll(/\[([^\]]{2,180})\]\((https?:\/\/[^\s)]+)\)/g)) {
    linked.push({ title: m[1], url: m[2], snippet: '', date: '', source: host(m[2]), image: '' });
    if (linked.length >= n) break;
  }
  if (linked.length) return linked;
  throw new Error('Mistral returned no structured web sources');
}

async function tavily(q, n, newsy) {
  const j = await getJson('https://api.tavily.com/search', { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, 'Content-Type': 'application/json' }, {
    method: 'POST', body: JSON.stringify({ query: q, max_results: n, topic: newsy ? 'news' : 'general', search_depth: 'basic', include_answer: false }),
  });
  return (j.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.content, date: r.published_date || '', source: host(r.url), image: '' }));
}

async function brave(q, n, newsy) {
  const base = newsy ? 'https://api.search.brave.com/res/v1/news/search' : 'https://api.search.brave.com/res/v1/web/search';
  const j = await getJson(`${base}?q=${encodeURIComponent(q)}&count=${n}&country=${REGION}`, { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY });
  const list = newsy ? j.results : j.web?.results;
  return (list || []).map((r) => ({ title: r.title, url: r.url, snippet: r.description, date: r.age || r.page_age || '', source: host(r.url), image: r.thumbnail?.src || '' }));
}

async function serpapi(q, n, newsy) {
  const key = encodeURIComponent(process.env.SERPAPI_KEY);
  if (newsy) {
    const j = await getJson(`https://serpapi.com/search.json?engine=google_news&q=${encodeURIComponent(q)}&gl=${REGION.toLowerCase()}&hl=en&api_key=${key}`);
    return (j.news_results || []).slice(0, n).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet || r.title, date: r.date || '', source: r.source?.name || host(r.link), image: r.thumbnail || '' }));
  }
  const j = await getJson(`https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=${n}&gl=${REGION.toLowerCase()}&hl=en&api_key=${key}`);
  return (j.organic_results || []).slice(0, n).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet, date: r.date || '', source: host(r.link), image: r.thumbnail || '' }));
}

// ---- keyless providers ----------------------------------------------------------------------
export function parseNewsRss(xml = '', n = 6) {
  const out = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const pick = (tag) => (m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1] || '';
    const title = strip(pick('title')); const link = strip(pick('link'));
    const src = strip(pick('source'));
    if (!title || !link) continue;
    // Google News titles end with " - Publisher"; the snippet field is just a link list, so keep the title.
    out.push({ title: src && title.endsWith(` - ${src}`) ? title.slice(0, -(src.length + 3)) : title, url: link, snippet: '', date: strip(pick('pubDate')), source: src || host(link) });
    if (out.length >= n) break;
  }
  return out;
}
async function googleNewsRss(q, n) {
  const xml = await getText(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-${REGION}&gl=${REGION}&ceid=${REGION}:en`);
  return parseNewsRss(xml, n);
}

export function parseDuckDuckGo(html = '', n = 6) {
  const out = [];
  const blocks = String(html).split(/class="result__body|class="result results_links/).slice(1);
  for (const b of blocks) {
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/) || b.match(/href="([^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = a[1].replace(/&amp;/g, '&');
    const redirect = url.match(/[?&]uddg=([^&]+)/);
    if (redirect) { try { url = decodeURIComponent(redirect[1]); } catch { continue; } }
    if (url.startsWith('//')) url = `https:${url}`;
    url = httpUrl(url);
    const sn = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (!url || /duckduckgo\.com\/y\.js/.test(url)) continue; // skip ads
    out.push({ title: strip(a[2]), url, snippet: strip(sn?.[1] || ''), date: '', source: host(url) });
    if (out.length >= n) break;
  }
  return out;
}
async function duckduckgo(q, n) {
  const html = await getText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=${REGION === 'NG' ? 'wt-wt' : `${REGION.toLowerCase()}-en`}`, { Accept: 'text/html' });
  return parseDuckDuckGo(html, n);
}


// DuckDuckGo News: real publisher links WITH each story's picture (unofficial endpoint, needs a short token first).
async function ddgNews(q, n) {
  const home = await getText(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iar=news&ia=news`, { Accept: 'text/html' });
  const vqd = (home.match(/vqd=["']?([\d-]+)["']?/) || [])[1];
  if (!vqd) throw new Error('no search token');
  const j = await getJson(`https://duckduckgo.com/news.js?l=wt-wt&o=json&noamp=1&q=${encodeURIComponent(q)}&vqd=${vqd}&p=-1`, { Referer: 'https://duckduckgo.com/' });
  return (j.results || []).slice(0, n).map((r) => ({
    title: r.title, url: r.url, snippet: r.excerpt, source: r.source || host(r.url), image: r.image || '',
    date: r.date ? new Date(Number(r.date) * 1000).toUTCString() : (r.relative_time || ''),
  }));
}

// Wikipedia: any place, person or topic, with a short summary and the article's picture. Always searched.
export function parseWikipedia(j, n = 2) {
  const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.filter((p) => p.extract && p.fullurl).slice(0, n).map((p) => ({
    title: `${p.title} - Wikipedia`, url: p.fullurl, snippet: p.extract, date: '', source: 'Wikipedia', image: p.thumbnail?.source || '',
  }));
}
async function wikipedia(q, n = 2) {
  const j = await getJson(`https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=${n + 1}&gsrnamespace=0&prop=extracts|pageimages|info&exintro=1&explaintext=1&exsentences=3&exlimit=max&piprop=thumbnail&pithumbsize=640&inprop=url&format=json&origin=*`);
  return parseWikipedia(j, n);
}

// ---- opening an article to find its picture (og:image) ----------------------------------------
const PRIVATE_V4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
function privateIp(ip) {
  if (net.isIPv4(ip)) return PRIVATE_V4.test(ip);
  const x = String(ip).toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:');
}
// Only real public web pages: never localhost, internal names or private addresses (also after redirects).
export async function isPublicUrl(u) {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol) || x.username || x.password) return false;
    const h = x.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
    if (net.isIP(h)) return !privateIp(h);
    const addrs = await dns.lookup(h, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch { return false; }
}

async function readCapped(res, maxBytes) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const chunks = []; let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); total += value.length;
  }
  try { await reader.cancel(); } catch { /* already closed */ }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8', 0, Math.min(total, maxBytes));
}

// Old-style Google News links ("…/articles/CBMi…") carry the publisher's address inside the id.
export function decodeGoogleNewsUrl(link = '') {
  try {
    const x = new URL(link);
    if (!/(^|\.)news\.google\.com$/.test(x.hostname)) return '';
    const id = x.pathname.split('/').pop() || '';
    const raw = Buffer.from(id.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1');
    const m = raw.match(/https?:\/\/[\x21-\x7e]+/);
    return m ? httpUrl(m[0].replace(/[^\x21-\x7e].*$/, '')) : '';
  } catch { return ''; }
}

const metaContent = (html, wanted) => {
  for (const tag of String(html).match(/<meta\b[^>]*>/gi) || []) {
    const attrs = {};
    for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
    if ((attrs.property || attrs.name || '').toLowerCase() === wanted) return strip(attrs.content || '');
  }
  return '';
};
export function parsePageMeta(html = '', baseUrl = '') {
  let image = metaContent(html, 'og:image') || metaContent(html, 'og:image:url') || metaContent(html, 'twitter:image') || metaContent(html, 'twitter:image:src');
  try { image = image ? httpUrl(new URL(image, baseUrl).href) : ''; } catch { image = ''; }
  return { image, description: metaContent(html, 'og:description') || metaContent(html, 'description') };
}

async function pageMeta(url) {
  let target = decodeGoogleNewsUrl(url) || url;
  for (let hop = 0; hop < 4; hop++) {
    if (!(await isPublicUrl(target))) return null;
    const r = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(4500) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { target = new URL(r.headers.get('location'), target).href; continue; }
    if (!r.ok || !/html/i.test(r.headers.get('content-type') || '')) return null;
    const meta = parsePageMeta(await readCapped(r, 350_000), target);
    return { ...meta, url: target };
  }
  return null;
}

// Gives results that came without a picture one (og:image), and a better summary when theirs was empty.
// Quick and best-effort: slow or blocked pages are simply left as plain links.
async function addPictures(results, limit = 5) {
  const todo = results.filter((r) => !r.image && r.source !== 'Wikipedia').slice(0, limit);
  await Promise.race([
    Promise.all(todo.map(async (r) => {
      try {
        const meta = await pageMeta(r.url);
        if (!meta) return;
        if (meta.image && !/news\.google\.com|gstatic\.com|googleusercontent\.com/i.test(meta.image)) r.image = meta.image;
        if (!r.snippet && meta.description) r.snippet = meta.description;
        if (/news\.google\.com/.test(r.url) && meta.url && !/news\.google\.com/.test(meta.url)) r.url = meta.url;
      } catch { /* leave it as a plain link */ }
    })),
    new Promise((resolve) => setTimeout(resolve, 6000)),
  ]);
}

function providers(newsy) {
  const list = [['mistral', mistral]];
  if (process.env.TAVILY_API_KEY) list.push(['tavily', tavily]);
  if (process.env.BRAVE_SEARCH_API_KEY) list.push(['brave', brave]);
  if (process.env.SERPAPI_KEY) list.push(['serpapi', serpapi]);
  // Keyless: news questions lead with DuckDuckGo News (has pictures), then Google News; everything else DuckDuckGo web.
  list.push(...(newsy ? [['ddg-news', ddgNews], ['google-news', googleNewsRss], ['duckduckgo', duckduckgo]] : [['duckduckgo', duckduckgo], ['google-news', googleNewsRss]]));
  return list;
}

const cache = new Map(); // "q" -> { at, value }

// -> { provider, results: [{ title, url, snippet, date, source }], error? }
export async function webSearch(rawQuery, n = 6) {
  const q = String(rawQuery || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (q.length < 2) return { provider: '', results: [], error: 'empty query' };
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3 * 60 * 1000) return hit.value;

  const newsy = looksNewsy(q);
  let lastError = '';
  const clean = (list, max) => {
    const seen = new Set();
    return (list || [])
      .map((r) => ({ title: clip(r.title, 140), url: httpUrl(r.url), snippet: clip(r.snippet, 320), date: clip(r.date, 40), source: clip(r.source, 40), image: httpUrl(r.image) }))
      .filter((r) => r.title && r.url && !seen.has(r.url) && seen.add(r.url))
      .slice(0, max);
  };
  // Wikipedia runs alongside the main search so it never slows it down.
  const wikiPromise = wikipedia(q, 2).then((r) => clean(r, 2)).catch(() => []);
  let provider = ''; let main = [];
  for (const [name, fn] of providers(newsy)) {
    try {
      const got = clean(await fn(q, n, newsy), n);
      if (got.length) { provider = name; main = got; break; }
    } catch (e) {
      lastError = `${name}: ${e.message}`;
      console.error(`web search (${name}) failed:`, e.message);
    }
  }
  const wiki = await wikiPromise;
  const have = new Set(main.map((r) => r.url));
  const results = [...main, ...wiki.filter((r) => !have.has(r.url))];
  if (!results.length) return { provider: '', results: [], error: lastError || 'no results' };
  await addPictures(results.filter((r) => r.source !== 'Wikipedia'));
  const value = { provider: provider || 'wikipedia', results };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return value;
}

// The query for a chat turn: the last question; a very short follow-up ("and in Lagos?") borrows the one before it.
export function searchQueryFrom(messages = []) {
  const users = (Array.isArray(messages) ? messages : []).filter((m) => m && m.role !== 'assistant' && typeof m.content === 'string')
    .map((m) => m.content.replace(/^\/\w+\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const last = users[users.length - 1] || '';
  const prev = users[users.length - 2] || '';
  const q = last.length < 28 && prev ? `${prev.slice(0, 120)} ${last}` : last;
  return q.slice(0, 200);
}

// The block added to the AI's instructions.
export function buildWebContext({ results = [], error = '' } = {}, now = new Date()) {
  const when = now.toUTCString();
  if (!results.length) {
    return `\n\nLIVE WEB SEARCH: the person turned on Web search, but the search could not be completed right now${error ? ` (${String(error).slice(0, 80)})` : ''}. Answer from your own knowledge, and say plainly in one short sentence that you could not check live sources, so the answer may be out of date.`;
  }
  const lines = results.map((r, i) => `[${i + 1}] ${r.title}${r.source ? ` - ${r.source}` : ''}${r.date ? ` (${r.date})` : ''}\n    ${r.snippet || '(no description)'}\n    ${r.url}`).join('\n');
  return `\n\nLIVE WEB SEARCH (the person turned on Web search; these results were fetched just now, ${when}):\n${lines}\n\nHow to use them: answer the person's latest question using these results as the source of truth for anything recent, and prefer them over your memory when they disagree. State dates when they matter. If the results do not actually answer the question, say so honestly instead of guessing. Never invent facts, numbers or URLs that are not in the results. When you mention where a key fact comes from, make the source's name a clickable link in exactly this form: [Publisher](https://exact-url-from-above) (max 4 per answer). Never paste a bare URL and never write "click here". The app shows each article's picture and link under your answer by itself, so do not describe or mention pictures. Do not paste this list back or mention "search results" unless it helps.`;
}

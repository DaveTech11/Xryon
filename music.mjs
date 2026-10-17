// Music search + streaming for the Xyron Music page.
//
// Providers (both free, no key needed):
//   * Audius  - full-length streaming of tracks uploaded by independent artists.
//   * Deezer  - huge mainstream catalogue, but the public API only gives 30-second previews.
// Results from both are merged so any search brings something back. Nothing is downloadable:
// audio only travels through /api/music/stream as a stream (see server.mjs), never as a file link.
//
// Google Cloud (optional, recommended):
//   * YouTube Data API v3 (YOUTUBE_API_KEY) - search + trending. Songs PLAY through YouTube's own
//     embedded player in the browser (YouTube does not allow its audio to be proxied or downloaded).
//   * Lyria on the Gemini API (GEMINI_API_KEY) - generates original songs from a text prompt.
// Without a YouTube key the page falls back to Audius + Deezer.
//
// Optional: set MUSIC_APP_NAME in .env to change the name Audius sees (default "Xyron").

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const UA = 'Mozilla/5.0 (compatible; XyronMusic/1.0)';
const APP = encodeURIComponent(process.env.MUSIC_APP_NAME || 'Xyron');
const AUDIUS = process.env.AUDIUS_API_URL || 'https://api.audius.co/v1';
const DEEZER = 'https://api.deezer.com';

async function getJson(url, ms = 9000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const https = (u) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '');
const clean = (s, n = 120) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function audiusTrack(t) {
  if (!t || !t.id || t.is_streamable === false || t.is_delete) return null;
  const a = t.artwork || {};
  return {
    id: `au_${t.id}`,
    title: clean(t.title) || 'Untitled',
    artist: clean(t.user?.name) || 'Unknown artist',
    album: '',
    cover: https(a['480x480'] || a['1000x1000'] || a['150x150']),
    duration: Number(t.duration) || 0,
    source: 'audius',
    full: true,
    upstream: `${AUDIUS}/tracks/${encodeURIComponent(t.id)}/stream?app_name=${APP}`,
  };
}

function deezerTrack(t) {
  if (!t || !t.id || !https(t.preview)) return null;
  return {
    id: `dz_${t.id}`,
    title: clean(t.title_short || t.title) || 'Untitled',
    artist: clean(t.artist?.name) || 'Unknown artist',
    album: clean(t.album?.title),
    cover: https(t.album?.cover_big || t.album?.cover_medium || t.album?.cover),
    duration: 30, // the preview clip length
    source: 'deezer',
    full: false,
    upstream: t.preview,
  };
}

// Mixes the lists one by one (so both providers show up near the top) and drops duplicates.
function interleave(lists, limit) {
  const out = [], seen = new Set();
  for (let i = 0; out.length < limit && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const t = l[i];
      if (!t) continue;
      const k = `${t.title}|${t.artist}`.toLowerCase().replace(/[^a-z0-9|]+/g, '');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const cache = new Map(); // key -> { at, tracks }
const TTL = 10 * 60 * 1000; // Deezer preview links carry a token, so keep this short
function cached(key, ttl = TTL) { const h = cache.get(key); return h && Date.now() - h.at < ttl ? h.tracks : null; }
function remember(key, tracks) { cache.set(key, { at: Date.now(), tracks }); if (cache.size > 120) cache.delete(cache.keys().next().value); }


// ---------------------------------------------------------------------------------------------
// YouTube Data API v3 (Google Cloud). Search costs 100 quota units (10,000 free per day), the
// videos lookup and "most popular" chart cost 1 each, so results are cached for 30 minutes.
// ---------------------------------------------------------------------------------------------
const GKEY = () => process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const YT = 'https://www.googleapis.com/youtube/v3';
export const youtubeConfigured = () => Boolean(process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
const YT_TTL = 30 * 60 * 1000;

const unescapeHtml = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function isoSeconds(d) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(d || ''));
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

function youtubeTrack(v) {
  const id = typeof v?.id === 'string' ? v.id : '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  if (v.status && v.status.embeddable === false) return null; // can't be played in our player
  const dur = isoSeconds(v.contentDetails?.duration);
  if (dur && (dur < 45 || dur > 20 * 60)) return null;        // skip shorts and hour-long mixes
  const th = v.snippet?.thumbnails || {};
  return {
    id: `yt_${id}`,
    videoId: id,
    title: clean(unescapeHtml(v.snippet?.title)) || 'Untitled',
    artist: clean(unescapeHtml(v.snippet?.channelTitle).replace(/\s*-\s*Topic$/i, '')) || 'YouTube',
    album: '',
    cover: https((th.high || th.medium || th.default || {}).url),
    duration: dur,
    source: 'youtube',
    full: true,
  };
}

async function ytVideos(ids) {
  if (!ids.length) return [];
  const j = await getJson(`${YT}/videos?part=snippet,contentDetails,status&id=${ids.join(',')}&key=${encodeURIComponent(GKEY())}`);
  const byId = new Map((j.items || []).map((v) => [v.id, v]));
  return ids.map((i) => youtubeTrack(byId.get(i))).filter(Boolean); // keep the search ranking
}

export async function youtubeSearch(q, limit = 25) {
  const query = clean(q, 80);
  const key = `yts:${query.toLowerCase()}`;
  const hit = cached(key, YT_TTL);
  if (hit) return hit;
  const j = await getJson(`${YT}/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=${Math.min(limit, 25)}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(GKEY())}`);
  const tracks = await ytVideos((j.items || []).map((i) => i.id?.videoId).filter(Boolean));
  remember(key, tracks);
  return tracks;
}

export async function youtubeTrending(limit = 25) {
  const region = String(process.env.YOUTUBE_REGION || 'NG').slice(0, 2).toUpperCase();
  const key = `ytt:${region}`;
  const hit = cached(key, YT_TTL);
  if (hit) return hit;
  const j = await getJson(`${YT}/videos?part=snippet,contentDetails,status&chart=mostPopular&videoCategoryId=10&regionCode=${region}&maxResults=${Math.min(limit, 50)}&key=${encodeURIComponent(GKEY())}`);
  const tracks = (j.items || []).map(youtubeTrack).filter(Boolean);
  if (tracks.length) remember(key, tracks);
  return tracks;
}

// ---------------------------------------------------------------------------------------------
// Lyria (Gemini API, Google Cloud). One request -> one MP3 (30 s clip, or a full song).
// ---------------------------------------------------------------------------------------------
export const lyriaConfigured = () => Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

export async function generateSong(prompt, full = false) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const models = full
    ? [process.env.LYRIA_FULL_MODEL || 'lyria-3.5', 'lyria-3-pro-preview']
    : [process.env.LYRIA_CLIP_MODEL || 'lyria-3-clip-preview'];
  let lastErr;
  for (const model of [...new Set(models)]) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(full ? 170000 : 100000),
      });
      if (!r.ok) throw new Error(`Lyria ${model} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      const parts = j.candidates?.[0]?.content?.parts || [];
      let audio = null; const text = [];
      for (const part of parts) { // never assume which part comes first
        const inl = part.inlineData || part.inline_data;
        if (inl?.data) audio = { mime: inl.mimeType || inl.mime_type || 'audio/mpeg', bytes: Buffer.from(inl.data, 'base64') };
        else if (part.text) text.push(part.text);
      }
      if (!audio?.bytes?.length) throw new Error(`Lyria ${model} returned no audio (${j.promptFeedback?.blockReason || j.candidates?.[0]?.finishReason || 'unknown'})`);
      return { ...audio, lyrics: text.join('\n').trim(), model };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export async function musicSearch(q, limit = 30) {
  const query = clean(q, 80);
  const key = `s:${query.toLowerCase()}`;
  const hit = cached(key);
  if (hit) return hit;
  if (youtubeConfigured()) {
    try { const yt = await youtubeSearch(query, limit); if (yt.length) { remember(key, yt); return yt; } }
    catch (e) { console.error('YouTube search failed, using Audius/Deezer:', e.message); }
  }
  const [au, dz] = await Promise.allSettled([
    getJson(`${AUDIUS}/tracks/search?query=${encodeURIComponent(query)}&limit=25&app_name=${APP}`),
    getJson(`${DEEZER}/search?q=${encodeURIComponent(query)}&limit=25`),
  ]);
  const a = au.status === 'fulfilled' ? (au.value?.data || []).map(audiusTrack).filter(Boolean) : [];
  const d = dz.status === 'fulfilled' ? (dz.value?.data || []).map(deezerTrack).filter(Boolean) : [];
  if (au.status === 'rejected' && dz.status === 'rejected') throw new Error('Both music providers failed');
  const tracks = interleave([d, a], limit);
  remember(key, tracks);
  return tracks;
}

export async function musicTrending(limit = 30) {
  const hit = cached('trending');
  if (hit) return hit;
  if (youtubeConfigured()) {
    try { const yt = await youtubeTrending(limit); if (yt.length) { remember('trending', yt); return yt; } }
    catch (e) { console.error('YouTube trending failed, using Audius/Deezer:', e.message); }
  }
  const [au, dz] = await Promise.allSettled([
    getJson(`${AUDIUS}/tracks/trending?limit=20&app_name=${APP}`),
    getJson(`${DEEZER}/chart/0/tracks?limit=25`),
  ]);
  const a = au.status === 'fulfilled' ? (au.value?.data || []).map(audiusTrack).filter(Boolean) : [];
  const d = dz.status === 'fulfilled' ? (dz.value?.data || []).map(deezerTrack).filter(Boolean) : [];
  if (au.status === 'rejected' && dz.status === 'rejected') throw new Error('Both music providers failed');
  const tracks = interleave([d, a], limit);
  remember('trending', tracks);
  return tracks;
}

// Fresh copy of one track (Deezer preview links expire, so saved songs get re-resolved).
export async function musicTrack(id) {
  const m = /^(au|dz)_([A-Za-z0-9_-]{1,40})$/.exec(String(id || ''));
  if (!m) return null;
  if (m[1] === 'dz') return deezerTrack(await getJson(`${DEEZER}/track/${m[2]}`));
  return audiusTrack((await getJson(`${AUDIUS}/tracks/${m[2]}?app_name=${APP}`))?.data);
}

// Pipes the upstream audio to the browser. Range requests are passed through so the seek bar,
// Android/iOS media controls and scrubbing from the notification all work.
export async function streamUpstream(url, req, res) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000); // only for the connection, not the whole song
  res.on('close', () => ctl.abort());
  const headers = { 'User-Agent': UA, Accept: 'audio/*,*/*;q=0.8' };
  if (req.headers.range) headers.Range = req.headers.range;
  let r;
  try { r = await fetch(url, { headers, redirect: 'follow', signal: ctl.signal }); }
  finally { clearTimeout(timer); }
  if (!r.ok && r.status !== 206) throw new Error(`upstream ${r.status}`);
  const out = {
    'Content-Type': r.headers.get('content-type') || 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=1800',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline', // streamed, not offered as a download
  };
  for (const h of ['content-length', 'content-range']) { const v = r.headers.get(h); if (v) out[h] = v; }
  res.writeHead(r.status === 206 ? 206 : 200, out);
  if (req.method === 'HEAD' || !r.body) return res.end();
  await pipeline(Readable.fromWeb(r.body), res).catch(() => {});
}

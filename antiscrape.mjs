// Anti-scraping layer for Xryon.
//
// Nothing can make a public website 100% unscrapable: anything a browser can display, a determined
// person with a real browser can copy. This module makes automated scraping slow, noisy and expensive:
//   1. known scraper tools / AI crawlers / headless browsers are refused (User-Agent)
//   2. API calls with no browser identity or from other websites are refused
//   3. fake "trap" URLs ban whoever touches them (real people never see them)
//   4. repeated rate-limit hits earn a temporary ban
//   5. robots.txt + X-Robots-Tag tell polite crawlers (incl. AI trainers) to stay out
//   6. hardened response headers (no framing, no hotlinking of API files, no MIME sniffing)
//
// Environment switches (all optional):
//   ANTISCRAPE=off              turn the whole guard off (emergency switch)
//   ANTISCRAPE_ALLOW_UA=a,b     extra User-Agent fragments to let through (e.g. your uptime monitor)
//   ANTISCRAPE_ALLOW_IPS=1.2.3.4,...   IPs that are never blocked or banned
//   ANTISCRAPE_NOINDEX=1        also ask search engines not to index the site at all
//   TRUST_PROXY_HOPS=1          how many proxies sit in front of the server; when set, the client IP is taken
//                               from the right end of X-Forwarded-For (cannot be faked). See /api/admin/antiscrape.
//   TRUST_CLOUDFLARE=1          use CF-Connecting-IP when present

const OFF = () => /^(off|0|false)$/i.test(process.env.ANTISCRAPE || '');
const csv = (v) => String(v || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

// ---------- client IP ----------
export function clientIp(req) {
  if (process.env.TRUST_CLOUDFLARE === '1' && req.headers['cf-connecting-ip']) {
    return String(req.headers['cf-connecting-ip']).trim();
  }
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  const hops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (parts.length) {
    // With a known number of proxies, count from the right: the left side is whatever the client typed.
    if (hops > 0) return parts[Math.max(0, parts.length - hops)];
    return parts[0]; // previous behaviour, kept as the default so nothing changes until you opt in
  }
  return String(req.socket?.remoteAddress || 'local').replace(/^::ffff:/, '');
}

// ---------- bans ----------
const bans = new Map(); // ip -> { until, reason }
const strikes = new Map(); // ip -> { n, start }
const stats = { blockedUa: 0, blockedApi: 0, blockedCrossSite: 0, trapHits: 0, bannedRequests: 0, bansIssued: 0 };
const allowIps = () => new Set(csv(process.env.ANTISCRAPE_ALLOW_IPS));

export function ban(ip, reason = 'abuse', ms = 24 * 3600 * 1000) {
  if (!ip || allowIps().has(String(ip).toLowerCase())) return;
  bans.set(ip, { until: Date.now() + ms, reason });
  stats.bansIssued++;
  if (bans.size > 20000) bans.delete(bans.keys().next().value);
  console.warn(`[antiscrape] banned ${ip} for ${Math.round(ms / 60000)} min: ${reason}`);
}
export function isBanned(ip) {
  const b = bans.get(ip);
  if (!b) return false;
  if (b.until <= Date.now()) { bans.delete(ip); return false; }
  return true;
}
// Called when someone keeps hitting the rate limit: 25 over-limit requests inside 10 minutes = 1 hour ban.
export function strike(ip) {
  if (OFF() || !ip) return;
  const t = Date.now();
  let s = strikes.get(ip);
  if (!s || t - s.start > 10 * 60000) s = { n: 0, start: t };
  s.n++;
  strikes.set(ip, s);
  if (s.n >= 25) { strikes.delete(ip); ban(ip, 'repeated rate-limit hits', 3600 * 1000); }
}
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of bans) if (v.until <= t) bans.delete(k);
  for (const [k, v] of strikes) if (t - v.start > 10 * 60000) strikes.delete(k);
}, 5 * 60000).unref?.();

// ---------- who is a bot ----------
// Scraping libraries and command-line tools.
const TOOL_UA = /(curl|wget|httpie|libwww|python-requests|python-urllib|aiohttp|httpx|urllib|scrapy|go-http-client|okhttp|java\/|apache-httpclient|jakarta|node-fetch|undici|axios|got\(|superagent|got-scraping|crawlee|colly|mechanize|restsharp|php\/|guzzle|perl|ruby|libcurl|postmanruntime|insomnia|rest-client|feedfetcher|webcopier|httrack|teleport|offline explorer|sitesucker|webzip|heritrix|nutch|jsoup|selenium|phantomjs|headlesschrome|puppeteer|playwright|cypress|webdriver|splash|zyte|apify|brightdata|scrapingbee|scraperapi|diffbot|screaming frog|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|blexbot|dataforseo)/i;
// AI-training and bulk-archive crawlers (they identify themselves honestly).
const AI_UA = /(gptbot|chatgpt-user|oai-searchbot|ccbot|claudebot|claude-web|anthropic-ai|perplexitybot|google-extended|googleother|applebot-extended|amazonbot|cohere-ai|meta-externalagent|facebookbot|ai2bot|diffbot|imagesiftbot|omgili|timpibot|youbot|velenpublicwebcrawler|webzio|img2dataset|ia_archiver|archive\.org_bot|commoncrawl)/i;

function uaAllowed(ua) {
  const l = ua.toLowerCase();
  return csv(process.env.ANTISCRAPE_ALLOW_UA).some((x) => l.includes(x));
}
export function isBotUa(ua) {
  const s = String(ua || '');
  if (uaAllowed(s)) return false;
  return TOOL_UA.test(s) || AI_UA.test(s);
}

// ---------- trap URLs ----------
// Listed under "Disallow" in robots.txt, so polite bots never go there. Scanners and scrapers that follow
// every link, or probe for common files, do - and get banned. Real visitors never see these.
const TRAP_EXACT = new Set(['/directory-all', '/members-all', '/sitemap-all.xml', '/api/export', '/api/dump', '/api/users/all', '/api/all-chats']);
const TRAP_PREFIX = ['/wp-admin', '/wp-login', '/wp-content', '/wp-includes', '/xmlrpc.php', '/phpmyadmin', '/.env', '/.git', '/.aws', '/.ssh', '/.svn', '/.DS_Store', '/server-status', '/actuator', '/vendor/phpunit', '/cgi-bin', '/boaform', '/solr', '/config.json', '/backup', '/database.sql', '/db.sql', '/id_rsa'];
function isTrap(p) {
  const l = p.toLowerCase();
  return TRAP_EXACT.has(l) || TRAP_PREFIX.some((x) => l.startsWith(x.toLowerCase())) || /\.(php\d?|asp|aspx|jsp|cgi|sql|bak|old|swp)$/i.test(l);
}

// ---------- robots.txt ----------
export function robotsTxt() {
  const ai = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'CCBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'GoogleOther', 'Applebot-Extended', 'Amazonbot', 'cohere-ai', 'Meta-ExternalAgent', 'FacebookBot', 'Bytespider', 'Diffbot', 'ImagesiftBot', 'Omgilibot', 'Timpibot', 'YouBot', 'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'PetalBot', 'ia_archiver'];
  const noindex = process.env.ANTISCRAPE_NOINDEX === '1';
  return [
    ...ai.map((b) => `User-agent: ${b}\nDisallow: /\n`),
    `User-agent: *\n${noindex ? 'Disallow: /' : ['Disallow: /api/', 'Disallow: /p/', 'Disallow: /directory-all', 'Disallow: /members-all', 'Disallow: /sitemap-all.xml', 'Allow: /$'].join('\n')}\n`,
  ].join('\n');
}

// ---------- main guard ----------
// Short-lived token links (/api/files/<id>?token=...) are fetched by outside AI services (image readers) that are
// not browsers, so they are let through here; the token itself is the credential and expires after 15 minutes.
const PUBLIC_API = (p, hasToken) =>
  p === '/api/health' ||
  (hasToken && p.startsWith('/api/files/')) ||
  p.startsWith('/api/payments/webhook/') ||
  p === '/api/push/key' ||
  p === '/api/auth/google' ||
  p === '/api/auth/google/callback';

function refuse(res, status, text = 'Forbidden') {
  try {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
  } catch {}
  return true;
}

function setHeaders(res, p) {
  const h = (k, v) => { if (!res.hasHeader(k)) res.setHeader(k, v); };
  h('X-Content-Type-Options', 'nosniff');
  h('Referrer-Policy', 'strict-origin-when-cross-origin');
  h('Permissions-Policy', 'geolocation=(), payment=(self), usb=(), bluetooth=(), serial=()');
  // Ask well-behaved crawlers not to archive, snippet, or train on pages and pictures.
  h('X-Robots-Tag', process.env.ANTISCRAPE_NOINDEX === '1' ? 'noindex, nofollow, noarchive, nosnippet, noai, noimageai' : 'noarchive, noai, noimageai');
  if (p.startsWith('/p/')) return; // published sites carry their own sandbox headers and run in an opaque origin
  h('X-Frame-Options', 'SAMEORIGIN'); // other websites cannot embed the app in a frame
  if (p.startsWith('/api/')) {
    h('Cross-Origin-Resource-Policy', 'same-origin'); // other websites cannot hotlink uploaded files, images or audio
    h('Cache-Control', 'private, no-store');
  }
}

/**
 * Returns true when the request was answered here (blocked / robots / trap) and the caller must stop.
 * Call it first thing in the request handler.
 */
export function guard(req, res) {
  if (OFF()) return false;
  let p = '/', hasToken = false;
  try { const u = new URL(req.url, 'http://x'); p = u.pathname; hasToken = !!u.searchParams.get('token'); } catch {}
  const ip = clientIp(req);
  if (allowIps().has(String(ip).toLowerCase())) { setHeaders(res, p); return false; }

  if (isBanned(ip)) { stats.bannedRequests++; return refuse(res, 403); }

  setHeaders(res, p);

  if (p === '/robots.txt' && (req.method === 'GET' || req.method === 'HEAD')) {
    const body = robotsTxt();
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  if (isTrap(p)) {
    stats.trapHits++;
    ban(ip, `trap: ${p.slice(0, 60)}`);
    return refuse(res, 404, 'Not found');
  }

  if (PUBLIC_API(p, hasToken)) return false; // providers, uptime monitors and the sign-in redirect must always get through

  const ua = String(req.headers['user-agent'] || '');
  const isApi = p.startsWith('/api/');

  if (p.startsWith('/p/')) return false; // published sites are public on purpose

  // 1. Known scraping tools, headless automation and AI crawlers.
  if (isBotUa(ua)) { stats.blockedUa++; return refuse(res, 403); }

  // 2. The API is for the app. Real browsers always send a User-Agent and Accept-Language.
  if (isApi) {
    if (!ua || ua.length < 12) { stats.blockedApi++; return refuse(res, 403); }
    if (!req.headers['accept-language'] && !req.headers['sec-fetch-site']) { stats.blockedApi++; return refuse(res, 403); }
    // 3. Browsers say where a request came from. Other websites calling our API (or hotlinking files) are refused.
    const site = String(req.headers['sec-fetch-site'] || '');
    const mode = String(req.headers['sec-fetch-mode'] || '');
    if (site === 'cross-site' && mode !== 'navigate') { stats.blockedCrossSite++; return refuse(res, 403); }
    const origin = String(req.headers.origin || '');
    if (origin && req.method !== 'GET' && req.method !== 'HEAD') {
      try { if (new URL(origin).host !== String(req.headers.host || '')) { stats.blockedCrossSite++; return refuse(res, 403); } } catch { return refuse(res, 403); }
    }
  }
  return false;
}

export function antiscrapeStatus(req) {
  return {
    enabled: !OFF(),
    yourIp: clientIp(req),
    forwardedFor: String(req.headers['x-forwarded-for'] || ''),
    socketIp: String(req.socket?.remoteAddress || ''),
    trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
    activeBans: [...bans.entries()].slice(-50).map(([ip, b]) => ({ ip, reason: b.reason, minutesLeft: Math.max(0, Math.round((b.until - Date.now()) / 60000)) })),
    stats: { ...stats },
  };
}
export function unban(ip) { return bans.delete(ip); }

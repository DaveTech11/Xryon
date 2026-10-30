// Domain registrar for "buy a domain inside Xyron" (Porkbun JSON API v3).
//
// Set PORKBUN_API_KEY and PORKBUN_SECRET_KEY on the SERVER (Porkbun -> Account -> API Access, and turn API
// access ON for each domain you register). Keys never reach the browser.
//
// Money flow: the user pays Xyron (wallet top-up through Flutterwave / OPay / crypto), Xyron's wallet is
// debited, and only then is the domain registered with YOUR Porkbun account balance. Keep Porkbun funded.
//
// Pricing: Porkbun quotes USD. We convert with NGN_PER_USD and add DOMAIN_MARKUP_PERCENT (default 10).

const env = (k) => (process.env[k] || '').trim();
const BASE = () => env('PORKBUN_API_URL') || 'https://api.porkbun.com/api/json/v3';
const TIMEOUT = 20000;

export const NGN_PER_USD = () => Number(env('NGN_PER_USD')) || 1500;
export const MARKUP = () => {
  const n = Number(env('DOMAIN_MARKUP_PERCENT'));
  return Number.isFinite(n) && n >= 0 ? n : 10;
};

export const registrarConfigured = () => Boolean(env('PORKBUN_API_KEY') && env('PORKBUN_SECRET_KEY'));

const auth = () => ({ apikey: env('PORKBUN_API_KEY'), secretapikey: env('PORKBUN_SECRET_KEY') });

async function pb(path, payload = {}, { authed = true } = {}) {
  const r = await fetch(`${BASE()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(authed ? { ...auth(), ...payload } : payload),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (!j || j.status !== 'SUCCESS') {
    const e = new Error(j?.message || `Registrar error (HTTP ${r.status})`);
    e.status = r.status === 429 ? 429 : 502;
    throw e;
  }
  return j;
}

// ---- Price list (USD), cached for an hour -------------------------------------------------------
let priceCache = { at: 0, map: null };
async function priceList() {
  if (priceCache.map && Date.now() - priceCache.at < 3600e3) return priceCache.map;
  const j = await pb('/pricing/get', {}, { authed: false });
  const map = {};
  for (const [tld, v] of Object.entries(j.pricing || {})) {
    const reg = Number(v?.registration);
    if (Number.isFinite(reg) && reg > 0) map[tld.toLowerCase()] = { usd: reg, renewUsd: Number(v?.renewal) || reg };
  }
  priceCache = { at: Date.now(), map };
  return map;
}

// Retail price the customer pays: registrar cost + markup, in USD and NGN (NGN rounded up to the next 50).
// Integer cents throughout so floating-point noise (2.00 * 1.10 = 2.2000000000000002) never adds a cent.
export function retail(costUsd) {
  const cents = Math.ceil(Math.round(Math.round(Number(costUsd) * 100) * (100 + MARKUP())) / 100 - 1e-9);
  const ngn = Math.ceil(Math.round(cents * NGN_PER_USD()) / 100 / 50 - 1e-9) * 50;
  return { usd: cents / 100, ngn };
}

export const tldOf = (name) => String(name).split('.').slice(1).join('.');

// Availability + price for one name. Falls back to `fallbackStatus` (RDAP lookup from the server) when the
// registrar is not configured, in which case no price is returned and buying is switched off.
export async function quote(name, fallbackStatus) {
  if (!registrarConfigured()) {
    return { name, status: await fallbackStatus(name), buyable: false, reason: 'not_configured' };
  }
  let prices;
  try { prices = await priceList(); } catch { prices = null; }
  const tld = tldOf(name);
  const base = prices?.[tld];
  if (!base) return { name, status: await fallbackStatus(name), buyable: false, reason: 'tld_unsupported' };
  let status = 'unknown';
  let cost = base.usd;
  try {
    const j = await pb(`/domain/checkDomain/${encodeURIComponent(name)}`);
    const a = j.response || {};
    status = String(a.avail).toLowerCase() === 'yes' ? 'available' : 'taken';
    // Premium names are priced individually; do not sell those through the simple flow.
    if (String(a.premium || '').toLowerCase() === 'yes') return { name, status, buyable: false, reason: 'premium' };
    if (Number(a.price) > 0) cost = Number(a.price);
  } catch (e) {
    if (e.status === 429) return { name, status: 'unknown', buyable: false, reason: 'busy' };
    status = await fallbackStatus(name);
  }
  const p = retail(cost);
  return { name, status, buyable: status === 'available', costUsd: cost, priceUsd: p.usd, priceNgn: p.ngn, renewUsd: base.renewUsd };
}

// Register the name. `costUsd` is what we expect to pay; Porkbun refuses if the live price is different.
export async function register(name, costUsd) {
  const pennies = Math.round(Number(costUsd) * 100);
  if (!Number.isFinite(pennies) || pennies <= 0) throw new Error('Bad price.');
  return pb(`/domain/create/${encodeURIComponent(name)}`, { cost: pennies, agreeToTerms: 'yes' });
}

// Point a registered domain at a host. `records` look like [{type:'A',name:'@',value:'1.2.3.4'}].
export async function setDns(name, records) {
  const root = name;
  const out = [];
  for (const rec of records) {
    const sub = !rec.name || rec.name === '@' ? '' : rec.name.replace(new RegExp(`\\.?${root.replace(/\./g, '\\.')}$`), '');
    try {
      await pb(`/dns/create/${encodeURIComponent(root)}`, { type: rec.type, name: sub, content: rec.value, ttl: '600' });
      out.push({ ...rec, ok: true });
    } catch (e) {
      out.push({ ...rec, ok: false, error: e.message });
    }
  }
  return out;
}

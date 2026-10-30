import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { guard, isBotUa, clientIp, ban, isBanned, strike, robotsTxt } from '../antiscrape.mjs';

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const server = http.createServer((req, res) => { if (guard(req, res)) return; res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); });
let port;
test.before(() => new Promise((r) => server.listen(0, '127.0.0.1', () => { port = server.address().port; r(); })));
test.after(() => server.close());

const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
    let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
  });
  req.on('error', reject); req.end();
});
const browser = (extra = {}) => ({ 'User-Agent': BROWSER, 'Accept-Language': 'en-US,en;q=0.9', ...extra });
let n = 10; const fresh = () => ({ 'X-Forwarded-For': `203.0.113.${n++}` }); // each test gets its own client IP

test('scraper tools and AI crawlers are recognised, real browsers are not', () => {
  for (const ua of ['curl/8.4.0', 'python-requests/2.31', 'Scrapy/2.11', 'Go-http-client/2.0', 'GPTBot/1.0', 'CCBot/2.0', 'Mozilla/5.0 HeadlessChrome/120', 'node-fetch/1.0', 'axios/1.6']) assert.ok(isBotUa(ua), ua);
  assert.equal(isBotUa(BROWSER), false);
  assert.equal(isBotUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'), false);
});

test('normal browser gets the site and the API', async () => {
  assert.equal((await get('/', browser(fresh()))).status, 200);
  assert.equal((await get('/api/auth/me', browser(fresh()))).status, 200);
});

test('scraper user agents are refused', async () => {
  assert.equal((await get('/', { 'User-Agent': 'python-requests/2.31', ...fresh() })).status, 403);
  assert.equal((await get('/api/entities/Conversation', { 'User-Agent': 'curl/8.4.0', ...fresh() })).status, 403);
});

test('API refuses requests that do not look like a browser', async () => {
  assert.equal((await get('/api/auth/me', { ...fresh() })).status, 403); // no User-Agent
  assert.equal((await get('/api/auth/me', { 'User-Agent': BROWSER, ...fresh() })).status, 403); // no Accept-Language / Sec-Fetch
});

test('other websites cannot call the API or hotlink files', async () => {
  assert.equal((await get('/api/files/abc', browser({ 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors', ...fresh() }))).status, 403);
  assert.equal((await get('/api/files/abc', browser({ 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors', ...fresh() }))).status, 200);
  assert.equal((await get('/api/chat', browser({ Origin: 'https://evil.example', ...fresh() }), 'POST')).status, 403);
});

test('things that must keep working still do', async () => {
  const bot = { 'User-Agent': 'python-requests/2.31' };
  assert.equal((await get('/api/health', { ...bot, ...fresh() })).status, 200); // uptime monitor
  assert.equal((await get('/api/payments/webhook/flutterwave', { ...bot, ...fresh() }, 'POST')).status, 200); // payment provider
  assert.equal((await get('/api/files/abc?token=xyz', { ...bot, ...fresh() })).status, 200); // token link fetched by an AI image reader
  assert.equal((await get('/api/files/abc', { ...bot, ...fresh() })).status, 403); // ...but not without the token
  assert.equal((await get('/p/site123/', { ...bot, ...fresh() })).status, 200); // published user sites are public
});

test('trap URLs ban the visitor, and the ban sticks', async () => {
  const h = fresh();
  assert.equal((await get('/.env', browser(h))).status, 404);
  assert.equal((await get('/', browser(h))).status, 403);
  assert.equal((await get('/directory-all', browser(fresh()))).status, 404);
  assert.equal((await get('/wp-login.php', browser(fresh()))).status, 404);
});

test('repeated rate-limit hits become a ban', () => {
  const req = { headers: { 'x-forwarded-for': '198.51.100.77' }, socket: {} };
  for (let i = 0; i < 25; i++) strike('198.51.100.77');
  assert.ok(isBanned(clientIp(req)));
});

test('TRUST_PROXY_HOPS reads the IP from the right, so a faked header does not help', () => {
  const req = { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, socket: {} };
  assert.equal(clientIp(req), '6.6.6.6'); // default: unchanged behaviour
  process.env.TRUST_PROXY_HOPS = '1';
  assert.equal(clientIp(req), '203.0.113.9');
  delete process.env.TRUST_PROXY_HOPS;
});

test('robots.txt blocks AI crawlers and security headers are set', async () => {
  const r = await get('/robots.txt', { 'User-Agent': 'Googlebot/2.1', ...fresh() });
  assert.equal(r.status, 200);
  assert.match(r.body, /User-agent: GPTBot\nDisallow: \//);
  assert.match(r.body, /Disallow: \/api\//);
  const page = await get('/api/x', browser(fresh()));
  assert.equal(page.headers['cross-origin-resource-policy'], 'same-origin');
  assert.equal(page.headers['x-frame-options'], 'SAMEORIGIN');
  assert.match(page.headers['x-robots-tag'], /noai/);
});

test('ANTISCRAPE=off disables everything', async () => {
  process.env.ANTISCRAPE = 'off';
  assert.equal((await get('/', { 'User-Agent': 'curl/8.0', ...fresh() })).status, 200);
  delete process.env.ANTISCRAPE;
});

// End-to-end check of the wallet + "buy a domain inside Xyron" flow against the REAL server.mjs,
// with a mock Porkbun registrar (no internet, no keys).
// Run: node tests/e2e-wallet.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const MOCK_PORT = 4941, APP_PORT = 4942;
const registered = [];
let failRegister = false;
const mock = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const j = body ? JSON.parse(body) : {};
  const reply = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url.endsWith('/pricing/get')) return reply({ status: 'SUCCESS', pricing: { com: { registration: '10.00', renewal: '11.00' }, xyz: { registration: '2.00', renewal: '12.00' } } });
  if (req.url.includes('/domain/checkDomain/')) {
    const name = decodeURIComponent(req.url.split('/domain/checkDomain/')[1]);
    if (name.startsWith('taken')) return reply({ status: 'SUCCESS', response: { avail: 'no' } });
    if (name.startsWith('premium')) return reply({ status: 'SUCCESS', response: { avail: 'yes', premium: 'yes', price: '900' } });
    return reply({ status: 'SUCCESS', response: { avail: 'yes', price: name.endsWith('.xyz') ? '2.00' : '10.00' } });
  }
  if (req.url.includes('/domain/create/')) {
    if (failRegister) return reply({ status: 'ERROR', message: 'nope' });
    registered.push({ name: decodeURIComponent(req.url.split('/domain/create/')[1]), cost: j.cost, agree: j.agreeToTerms, hasKeys: !!(j.apikey && j.secretapikey) });
    return reply({ status: 'SUCCESS' });
  }
  reply({ status: 'ERROR', message: 'unknown ' + req.url });
});
await new Promise((r) => mock.listen(MOCK_PORT, r));

const dir = mkdtempSync(path.join(tmpdir(), 'xyron-wallet-'));
mkdirSync(path.join(dir, 'data'));
const u = (id) => ({ id, email: id + '@test.dev', full_name: id, role: 'user', emailVerified: true, created_date: new Date().toISOString() });
writeFileSync(path.join(dir, 'data', 'xyron.json'), JSON.stringify({
  users: [u('rich'), u('poor')], sessions: [{ id: 'S_RICH', userId: 'rich' }, { id: 'S_POOR', userId: 'poor' }], subscriptions: [],
  wallets: { rich: { balance: 20000, ledger: [] } },
  conversations: [], messages: [], usage: [], memories: [], settings: {},
}));
const srv = spawn('node', [path.resolve('server.mjs')], { cwd: dir, env: {
  PATH: process.env.PATH, ANTISCRAPE: 'off', PORT: String(APP_PORT), RATE_LIMIT_PER_MINUTE: '1000',
  PORKBUN_API_URL: `http://127.0.0.1:${MOCK_PORT}`, PORKBUN_API_KEY: 'pk_test', PORKBUN_SECRET_KEY: 'sk_test',
  NGN_PER_USD: '1500', DOMAIN_MARKUP_PERCENT: '10',
} });
const logs = []; srv.stdout.on('data', (d) => logs.push(String(d))); srv.stderr.on('data', (d) => logs.push(String(d)));
const stop = () => { srv.kill(); mock.close(); }; process.on('exit', stop);
for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${APP_PORT}/api/auth/me`); if (r.status === 401 || r.status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

const call = async (session, method, url, body) => {
  const r = await fetch(`http://127.0.0.1:${APP_PORT}${url}`, { method, headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: `xyron_session=${session}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { ...j, domainStatus: j.status, status: r.status }; // `status` = HTTP code (a domain quote also has its own `status`)
};
let n = 0, total = 0;
const ok = (label, fn) => { total++; try { fn(); n++; console.log('ok  ', label); } catch (e) { console.log('FAIL', label, '-', e.message); process.exitCode = 1; } };

// ---- packages
const w = await call('S_RICH', 'GET', '/api/wallet');
ok('wallet shows balance and the six packages', () => {
  assert.equal(w.status, 200); assert.equal(w.balanceNgn, 20000);
  assert.deepEqual(w.packages.map((p) => `${p.currency}:${p.amount}`), ['ngn:500', 'ngn:1500', 'ngn:5000', 'usd:1', 'usd:3', 'usd:10']);
  assert.equal(w.packages.find((p) => p.id === 'usd_3').credit, 4500); // $3 at 1500/USD
  assert.equal(w.domainsEnabled, true);
});
const anon = await call(null, 'GET', '/api/wallet');
ok('anonymous wallet request is rejected', () => assert.equal(anon.status, 401));

// ---- top-up validation (providers are not configured here, so nothing can be charged)
const t1 = await call('S_RICH', 'POST', '/api/wallet/topup', { packageId: 'bogus', method: 'flutterwave' });
ok('unknown package rejected', () => assert.equal(t1.status, 400));
const t2 = await call('S_RICH', 'POST', '/api/wallet/topup', { packageId: 'usd_3', method: 'flutterwave' });
ok('dollar package cannot be paid with a naira method', () => { assert.equal(t2.status, 400); assert.match(t2.message, /crypto/i); });
const t3 = await call('S_RICH', 'POST', '/api/wallet/topup', { packageId: 'ngn_500', method: 'crypto' });
ok('naira package cannot be paid with crypto', () => assert.equal(t3.status, 400));
const t4 = await call('S_RICH', 'POST', '/api/wallet/topup', { packageId: 'ngn_1500', method: 'flutterwave' });
ok('valid package but provider not configured -> 501, no balance change', () => assert.equal(t4.status, 501));

// ---- quotes
const q1 = await call('S_RICH', 'GET', '/api/domains/quote?name=myshop.com');
ok('quote: $10 + 10% = $11 = N16,500', () => { assert.equal(q1.status, 200); assert.equal(q1.buyable, true); assert.equal(q1.priceUsd, 11); assert.equal(q1.priceNgn, 16500); });
const q2 = await call('S_RICH', 'GET', '/api/domains/quote?name=takenname.com');
ok('quote: taken name is not buyable', () => { assert.equal(q2.status, 200); assert.equal(q2.buyable, false); });
const q3 = await call('S_RICH', 'GET', '/api/domains/quote?name=premiumbrand.com');
ok('quote: premium-priced names are refused', () => { assert.equal(q3.buyable, false); assert.equal(q3.reason, 'premium'); });
const q4 = await call('S_RICH', 'GET', '/api/domains/quote?name=cool.xyz');
ok('quote: cheap .xyz priced correctly ($2.20 -> N3,300)', () => { assert.equal(q4.priceUsd, 2.2); assert.equal(q4.priceNgn, 3300); });
const q5 = await call('S_RICH', 'GET', '/api/domains/quote?name=cool.zzzz');
ok('quote: unsupported ending is not buyable', () => { assert.equal(q5.buyable, false); assert.equal(q5.reason, 'tld_unsupported'); });

// ---- buying
const b0 = await call('S_POOR', 'POST', '/api/domains/buy', { domain: 'myshop.com' });
ok('empty wallet -> 402 with the missing amount, nothing registered', () => { assert.equal(b0.status, 402); assert.equal(b0.needNgn, 16500); assert.equal(registered.length, 0); });

const b1 = await call('S_RICH', 'POST', '/api/domains/buy', { domain: 'myshop.com', expectedNgn: 16500 });
ok('purchase succeeds, registrar gets the right cost in pennies and terms', () => {
  assert.equal(b1.status, 200); assert.equal(b1.balanceNgn, 20000 - 16500);
  assert.deepEqual(registered[0], { name: 'myshop.com', cost: 1000, agree: 'yes', hasKeys: true });
});
const b2 = await call('S_RICH', 'POST', '/api/domains/buy', { domain: 'myshop.com' });
ok('same domain cannot be bought twice', () => { assert.equal(b2.status, 409); assert.equal(registered.length, 1); });
const b3 = await call('S_POOR', 'POST', '/api/domains/buy', { domain: 'myshop.com' });
ok('another user cannot buy a name that is already sold', () => assert.equal(b3.status, 409));
const b4 = await call('S_RICH', 'POST', '/api/domains/buy', { domain: 'stalepricing.com', expectedNgn: 100 });
ok('price changed under the customer -> 409, not charged', () => { assert.equal(b4.status, 409); assert.equal(registered.length, 1); });

failRegister = true;
const b5 = await call('S_RICH', 'POST', '/api/domains/buy', { domain: 'willfail.xyz', expectedNgn: 3300 });
failRegister = false;
const w2 = await call('S_RICH', 'GET', '/api/wallet');
ok('registrar failure -> 502 and the money comes straight back', () => {
  assert.equal(b5.status, 502); assert.equal(w2.balanceNgn, 3500);
  assert.equal(w2.ledger[0].type, 'refund'); assert.equal(w2.ledger[1].type, 'domain');
});
const mine = await call('S_RICH', 'GET', '/api/domains/mine');
const mine2 = await call('S_POOR', 'GET', '/api/domains/mine');
ok('"my domains" lists only my own purchases', () => { assert.deepEqual(mine.domains.map((d) => d.name), ['myshop.com']); assert.equal(mine2.domains.length, 0); });

// ---- concurrency: two simultaneous purchases can never spend one balance twice
const [c1, c2] = await Promise.all([
  call('S_RICH', 'POST', '/api/domains/buy', { domain: 'race-a.xyz' }),
  call('S_RICH', 'POST', '/api/domains/buy', { domain: 'race-b.xyz' }),
]);
const w3 = await call('S_RICH', 'GET', '/api/wallet');
ok('two simultaneous purchases can only spend the balance once', () => {
  const wins = [c1, c2].filter((x) => x.status === 200).length;
  assert.equal(wins, 1);
  assert.equal(w3.balanceNgn, 3500 - 3300);
  assert.ok([c1, c2].some((x) => x.status === 402 || x.status === 429));
});

// ---- projects: edit routes need a Render connection
const r1 = await call('S_RICH', 'POST', '/api/render/update', { serviceId: 'srv-abc123', name: 'x' });
ok('editing a Render project without Render connected -> 409 (not a crash)', () => assert.equal(r1.status, 409));
const r2 = await call('S_RICH', 'POST', '/api/render/update', { serviceId: 'not-a-service', name: 'x' });
ok('bad service id rejected', () => assert.equal(r2.status, 400));
const pub = await call('S_RICH', 'POST', '/api/host/publish', { name: 'Demo', files: [{ path: 'index.html', content: '<h1>hi</h1>' }] });
const site = await call('S_RICH', 'GET', `/api/host/site?id=${pub.id}`);
ok('hosted site files can be read back for editing', () => { assert.equal(site.status, 200); assert.equal(site.files[0].content, '<h1>hi</h1>'); });
const upd = await call('S_RICH', 'POST', '/api/host/publish', { name: 'Demo v2', siteId: pub.id, files: [{ path: 'index.html', content: '<h1>edited</h1>' }] });
const site2 = await call('S_RICH', 'GET', `/api/host/site?id=${pub.id}`);
ok('editing a hosted site updates the same link', () => { assert.equal(upd.id, pub.id); assert.equal(site2.name, 'Demo v2'); assert.equal(site2.files[0].content, '<h1>edited</h1>'); });
const other = await call('S_POOR', 'GET', `/api/host/site?id=${pub.id}`);
ok("other users cannot read someone else's site files", () => assert.equal(other.status, 404));

console.log(`\n${n}/${total} passed`); stop(); process.exit(process.exitCode || 0);

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGithubUrl, fetchGithub } from '../githubFetch.mjs';

test('parses repo, tree, blob, raw, release and archive links', () => {
  assert.deepEqual(parseGithubUrl('reverse engineer https://github.com/morluto/rea.git please'), { kind: 'repo', owner: 'morluto', repo: 'rea', ref: 'HEAD' });
  assert.deepEqual(parseGithubUrl('https://github.com/a/b/tree/dev'), { kind: 'repo', owner: 'a', repo: 'b', ref: 'dev' });
  assert.deepEqual(parseGithubUrl('https://github.com/a/b/blob/main/src/x.js'), { kind: 'file', owner: 'a', repo: 'b', ref: 'main', path: 'src/x.js' });
  assert.deepEqual(parseGithubUrl('https://raw.githubusercontent.com/a/b/main/x/y.py'), { kind: 'file', owner: 'a', repo: 'b', ref: 'main', path: 'x/y.py' });
  assert.deepEqual(parseGithubUrl('https://github.com/a/b/releases/download/v1/app.apk'), { kind: 'asset', owner: 'a', repo: 'b', tag: 'v1', asset: 'app.apk' });
  assert.equal(parseGithubUrl('https://github.com/a/b/archive/refs/heads/main.zip').kind, 'archive');
  assert.equal(parseGithubUrl('github.com/a/b').kind, 'repo');
});
test('rejects non-GitHub, traversal and bare names unless allowed', () => {
  assert.equal(parseGithubUrl('https://evil.com/x')?.owner, undefined);
  assert.equal(parseGithubUrl('hello there'), null);
  assert.notEqual(parseGithubUrl('https://github.com/a/b/blob/main/..%2F..%2Fetc/passwd')?.kind, 'file');
  assert.equal(parseGithubUrl('owner/name'), null);
  assert.equal(parseGithubUrl('owner/name', { bare: true }).kind, 'repo');
});
test('fetch follows only GitHub hosts and caps size', async () => {
  const mk = (status, headers = {}, body = []) => ({ status, ok: status < 400, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, body: (async function* () { for (const b of body) yield Buffer.from(b); })() });
  const okFetch = async (u) => (u.startsWith('https://github.com/') ? mk(302, { location: 'https://objects.githubusercontent.com/x' }) : mk(200, {}, ['abc']));
  const r = await fetchGithub({ kind: 'asset', owner: 'a', repo: 'b', tag: 'v1', asset: 'app.apk' }, { fetchImpl: okFetch });
  assert.equal(r.name, 'app.apk'); assert.equal(r.bytes.toString(), 'abc');
  const evil = async () => mk(302, { location: 'https://evil.example/x' });
  await assert.rejects(fetchGithub({ kind: 'repo', owner: 'a', repo: 'b', ref: 'HEAD' }, { fetchImpl: evil }), /not allowed/);
  const big = async () => mk(200, {}, ['x'.repeat(50)]);
  await assert.rejects(fetchGithub({ kind: 'repo', owner: 'a', repo: 'b', ref: 'HEAD' }, { fetchImpl: big, maxBytes: 10 }), /larger than/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isVideoRequest, videoAspect } from '../videoIntent.mjs';
import { parsePlan, buildPlanPrompt, MAX_SECONDS } from '../videoPlan.mjs';

test('real video requests are detected', () => {
  for (const t of ['make a promo video about my shop', 'create a promotional video about vortyx ai using this', 'generate a 30 second reel for my bakery', 'turn this into a video', 'make me a tiktok video about my startup', '/video launch of my app', 'Can you create a trailer for my game?', 'make a slideshow video of my wedding photos'])
    assert.equal(isVideoRequest(t, { hasFiles: /this|photos/.test(t) }), true, t);
  assert.equal(isVideoRequest('make a video from these', { hasFiles: true }), true);
});
test('questions, code and downloads are not video requests', () => {
  for (const t of ['can u make videos?', 'make a video', 'how do I make a video player component in react', 'download this youtube video', 'write html code with a video tag', 'summarize this video', 'what is a promo video', 'create an image of a lion', 'trim the video with ffmpeg'])
    assert.equal(isVideoRequest(t), false, t);
});
test('aspect defaults to phone shape', () => {
  assert.equal(videoAspect('make a promo video'), 'vertical');
  assert.equal(videoAspect('make a youtube video, landscape'), 'wide');
  assert.equal(videoAspect('widescreen tiktok video'), 'vertical');
});
test('plan: good JSON is cleaned and bounded', () => {
  const raw = '```json\n{"title":"Vortyx","theme":"neon","music":"upbeat","scenes":[{"type":"title","title":"One signal in"},{"type":"cards","title":"Features","items":[{"label":"Chat","text":"Talk"},"Code"]},{"type":"image","image":0,"title":"Chat screen"},{"type":"cta","title":"Start free","text":"site.com"},]}\n```';
  const p = parsePlan(raw, { imageUrls: ['/api/files/a'], aspect: 'vertical' });
  assert.equal(p.theme, 'dark'); assert.equal(p.music, 'upbeat'); assert.equal(p.images.length, 1);
  assert.equal(p.scenes[0].type, 'title'); assert.equal(p.scenes.at(-1).type, 'cta');
  assert.equal(p.scenes.find((s) => s.type === 'cards').items.length, 2);
});
test('plan: AI cannot inject image urls, html or bad image indexes', () => {
  const raw = JSON.stringify({ scenes: [{ type: 'image', image: 5, title: 'x' }, { type: 'title', title: '<img src=x onerror=1>' }, { type: 'image', image: 0, src: 'http://evil', title: 'ok' }, { type: 'cta', title: 'go' }] });
  const p = parsePlan(raw, { imageUrls: ['/api/files/a'] });
  assert.deepEqual(p.images, ['/api/files/a']);
  assert.ok(p.scenes.every((s) => s.type !== 'image' || (s.image === 0 && !('src' in s))));
});
test('plan: every attached image appears, junk reply still gives a video', () => {
  const p = parsePlan('sorry I cannot', { request: 'make a promo video about my shop', imageUrls: ['/api/files/a', '/api/files/b'], imageNotes: ['a red shop front.', 'cakes'] });
  assert.equal(p.scenes.filter((s) => s.type === 'image').length, 2);
  assert.ok(p.scenes.length >= 4 && p.scenes[0].type === 'title' && p.scenes.at(-1).type === 'cta');
});
test('plan: total length is capped', () => {
  const scenes = Array.from({ length: 9 }, () => ({ type: 'text', title: 't', text: 'x', duration: 7 }));
  const p = parsePlan(JSON.stringify({ scenes }));
  assert.ok(p.scenes.reduce((a, s) => a + s.duration, 0) <= MAX_SECONDS + 3);
});
test('prompt carries request, notes and file text', () => {
  const { system, user } = buildPlanPrompt({ request: 'promo for my site', docText: 'PRICE $5', imageNotes: ['a chat screen'] });
  assert.match(system, /ONE JSON object/); assert.match(user, /promo for my site/); assert.match(user, /0: a chat screen/); assert.match(user, /PRICE \$5/);
});

// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageRequest } from '../imageIntent.mjs';
import { classifyRequest, pickTier, trimHistory, routeOf, ROUTES, AUTO_MODEL } from '../router.mjs';

const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });
const route = (msgs, ctx = {}) => { const c = classifyRequest(Array.isArray(msgs) ? msgs : [u(msgs)], ctx); return { ...c, tier: pickTier(c) }; };

const CASES = [
  // [label, messages, ctx, expected tier, expected kind]
  ['greeting emoji', 'Hi 👋', {}, 'Xyron Nexus V0 Mini', 'greeting'],
  ['greeting word', 'Hello', {}, 'Xyron Nexus V0 Mini', 'greeting'],
  ['simple question', 'What is the capital of France?', {}, 'Xyron Nexus V0 Mini', 'simple'],
  ['easy arithmetic', 'what is 15% of 80?', {}, 'Xyron Nexus V0 Mini', null],
  ['basic transform', 'translate good morning to french', {}, 'Xyron Nexus V0 Mini', 'simple'],
  ['general explanation', 'Explain what an API is', {}, 'Xyron Nexus V0 Mini', 'general'],
  ['explanation, how does', 'How does photosynthesis work?', {}, 'Xyron Nexus V0 Mini', 'general'],
  ['writing', 'Write an email to my landlord asking to fix the heater', {}, 'Xyron Nexus V0 Mini', 'writing'],
  ['summarize', 'Summarize this: ' + 'The quarterly report shows growth in several markets. '.repeat(10), {}, 'Xyron Nexus V0 Mini', 'writing'],
  ['python script', 'Write a Python script to rename files', {}, 'Xyron Nexus V1 Pro', 'code'],
  ['react dashboard', 'Build a React dashboard with charts', {}, 'Xyron Nexus V1 Pro', 'code'],
  ['js debug', 'Debug this JavaScript error: TypeError: Cannot read properties of undefined (reading \'map\')', {}, 'Xyron Nexus V1 Pro', 'code'],
  ['find the bug react', 'Find the bug in this React component\n```jsx\nfunction A(){ const [x,setX]=useState(); return x.map(i=>i) }\n```', {}, 'Xyron Nexus V1 Pro', 'code'],
  ['complex math', 'Solve this complex mathematical problem: prove that the sum of the first n odd numbers is n^2', {}, 'Xyron Nexus V0 Pro', 'reasoning'],
  ['integral', 'Compute the integral of x^2 * e^x dx and show the derivation', {}, 'Xyron Nexus V0 Pro', 'reasoning'],
  ['logic puzzle', 'Here is a hard logic puzzle: three gods, one always lies, one always tells the truth, one answers randomly. Deduce how to identify each with three yes/no questions.', {}, 'Xyron Nexus V0 Pro', 'reasoning'],
  ['research', 'Research the latest developments in AI', {}, 'Xyron Nexus V0 Mini', 'research'],
  ['news', 'what is the latest AI news today', {}, 'Xyron Nexus V0 Mini', 'research'],
  ['zip project', 'review this project and find issues', { hasZip: true }, 'Xyron Nexus V1 Pro', 'code'],
  ['pdf attached short msg', 'analyze this', { hasFiles: true }, 'Xyron Nexus V0 Mini', 'file'],
  ['image attached short msg', "what's this?", { hasImages: true }, 'Xyron Nexus V0 Mini', 'file'],
];
for (const [label, msgs, ctx, tier, kind] of CASES) {
  test(label, () => {
    const r = route(msgs, ctx);
    assert.equal(r.tier, tier, `${label}: got ${r.tier} (${r.kind}, L${r.level}) because ${r.reasons.join('; ')}`);
    if (kind) assert.equal(r.kind, kind, `${label}: kind ${r.kind}`);
  });
}

test('research sets useWeb, greeting never does', () => {
  assert.equal(route('Research the latest developments in AI').useWeb, true);
  assert.equal(route('Hi 👋', { webSearch: true }).useWeb, false);
  assert.equal(route('Explain what an API is').useWeb, false);
  assert.equal(route('Explain what an API is', { webSearch: true }).useWeb, true); // person turned the switch on
});

test('large code task goes to level 3', () => {
  const r = route('Build a full-stack SaaS app with authentication, Stripe payments and an admin panel');
  assert.equal(r.kind, 'code'); assert.equal(r.level, 3);
});

test('follow-up inherits the previous job', () => {
  const r = route([u('Write a Python script that renames files by date'), a('```python\nprint(1)\n```'), u('now add dark mode logging')]);
  assert.equal(r.kind, 'code');
  const r2 = route([u('Prove that sqrt(2) is irrational'), a('Suppose...'), u('continue')]);
  assert.equal(r2.tier, 'Xyron Nexus V0 Pro');
});

test('"hi" in the middle of a hard thread is still a greeting (fast)', () => {
  assert.equal(route([u('Write a Python script to rename files'), a('ok'), u('thanks')]).tier, 'Xyron Nexus V0 Mini');
});

test('trimHistory keeps the newest message and starts on a user turn', () => {
  const msgs = Array.from({ length: 30 }, (_, i) => (i % 2 ? a('a' + i) : u('u' + i)));
  const t = trimHistory(msgs, 1);
  assert.ok(t.length <= 6); assert.equal(t[t.length - 1].content, msgs[29].content); assert.equal(t[0].role, 'user');
});

test('selected Xyron mode nudges neutral messages', () => {
  assert.equal(route('tell me about the roman empire', { mode: 'deep' }).tier, 'Xyron Nexus V0 Pro');
  assert.equal(route('help me with this', { mode: 'coder' }).tier, 'Xyron Nexus V1 Pro');
  assert.equal(route('Hi 👋', { mode: 'deep' }).tier, 'Xyron Nexus V0 Mini'); // greetings stay fast
});

test('AUTO_MODEL constant', () => assert.equal(AUTO_MODEL, 'Xyron Nexus Auto'));

// The seven named routes: Fast Chat, General Chat, Coding, Reasoning, Web Research, File Processing, Image Generation.
const rid = (msgs, ctx = {}) => routeOf(classifyRequest(Array.isArray(msgs) ? msgs : [u(msgs)], ctx));
const ROUTE_CASES = [
  ['greeting -> fast_chat', 'Hi 👋', {}, 'fast_chat'],
  ['short question -> fast_chat', 'What is the capital of France?', {}, 'fast_chat'],
  ['easy maths -> fast_chat', 'what is 15% of 80?', {}, 'fast_chat'],
  ['explanation -> general_chat', 'Explain what an API is', {}, 'general_chat'],
  ['writing -> general_chat', 'Write an email to my landlord asking to fix the heater', {}, 'general_chat'],
  ['code -> coding', 'Write a Python script to rename files', {}, 'coding'],
  ['zip -> coding', 'review this project and find issues', { hasZip: true }, 'coding'],
  ['hard maths -> reasoning', 'Compute the integral of x^2 * e^x dx and show the derivation', {}, 'reasoning'],
  ['news -> web_research', 'what is the latest AI news today', {}, 'web_research'],
  ['web switch alone keeps general_chat', 'tell me about the roman empire', { webSearch: true }, 'general_chat'],
  ['document -> file_processing', 'analyze this', { hasFiles: true }, 'file_processing'],
  ['picture attached -> file_processing', 'what is this?', { hasImages: true }, 'file_processing'],
  ['draw -> image_generation', 'draw a logo for my coffee shop', {}, 'image_generation'],
  ['generate picture -> image_generation', 'generate an image of a lion at sunset', {}, 'image_generation'],
  ['edit with picture stays image', 'create a picture of this in anime style', { hasImages: true }, 'image_generation'],
  ['image prompt request is not an image job', 'write me a prompt to generate an image of a lion', {}, 'general_chat'],
];
for (const [label, msg, ctx, want] of ROUTE_CASES) test(`route: ${label}`, () => assert.equal(rid(msg, ctx), want));

test('all seven routes exist and have labels', () => {
  assert.deepEqual(Object.keys(ROUTES), ['fast_chat', 'general_chat', 'coding', 'reasoning', 'web_research', 'file_processing', 'image_generation']);
  for (const r of Object.values(ROUTES)) assert.ok(r.label && r.about);
});

test('image requests never switch on web search', () => {
  assert.equal(classifyRequest([u('draw a logo for my shop')], { webSearch: true }).useWeb, false);
  assert.equal(classifyRequest([u('latest news')], { webSearch: true }).useWeb, true);
});

// One shared rule: the chat page (settings.js) and the server router both use imageIntent.mjs.
const IMAGE_YES = ['draw a logo for my coffee shop', 'generate an image of a lion at sunset', 'make me a wallpaper of mountains', '/logo coffee shop', 'create a picture of this in anime style'];
const IMAGE_NO = ['can u generate images?', 'can you draw?', 'write me a prompt to generate an image of a lion', 'build a React image gallery component', 'draw a conclusion from this data', 'what is the capital of France?'];
for (const m of IMAGE_YES) test(`image rule: yes -> ${m}`, () => { assert.equal(isImageRequest(m), true); assert.equal(rid(m), 'image_generation'); });
for (const m of IMAGE_NO) test(`image rule: no -> ${m}`, () => { assert.equal(isImageRequest(m), false); assert.notEqual(rid(m), 'image_generation'); });

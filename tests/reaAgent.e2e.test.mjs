// End-to-end test of the REA agent loop with a FAKE `rea mcp` server (REA itself is not needed) and a scripted AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, chmod, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'fakerea-'));
const fake = path.join(dir, 'rea');
await writeFile(fake, `#!/usr/bin/env node
const T=[{name:'open_binary',inputSchema:{properties:{path:{}},required:['path']}},{name:'search_strings',inputSchema:{properties:{query:{}},required:['query']}},{name:'decompile_function',inputSchema:{properties:{name:{}}}},{name:'capture_process_scenario',inputSchema:{}},{name:'close_binary',inputSchema:{}}];
let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){const l=b.slice(0,i);b=b.slice(i+1);if(!l.trim())continue;const m=JSON.parse(l);if(m.id===undefined)continue;
const ok=r=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:r})+'\\n');
if(m.method==='initialize')ok({protocolVersion:'2025-06-18',capabilities:{},serverInfo:{name:'fake',version:'1'}});
else if(m.method==='tools/list')ok({tools:T});
else if(m.method==='tools/call'){const n=m.params.name,a=m.params.arguments||{};
 if(n==='decompile_function'&&a.name==='nope')ok({isError:true,content:[{type:'text',text:'no such function'}]});
 else ok({content:[{type:'text',text:n+' result '+JSON.stringify(a)+(n==='search_strings'?' fn_login at 0x401000':'')}]});}
else ok({});}});
`);
await chmod(fake, 0o755);
process.env.REA_BIN = fake;
const { reaInvestigate } = await import('../reaAgent.mjs');

const exe = Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(200)]);

test('agent plans, runs tools in parallel, skips repeats, recovers from errors, verifies, reports progress', async () => {
  const replies = [
    '{"plan":["Open the file","Find login code","Explain it"],"thought":"start broad","tools":[{"tool":"open_binary","args":{"path":"target.exe"}},{"tool":"search_strings","args":{"query":"login"}}]}',
    '{"thought":"repeat + bad call","done":[0],"tools":[{"tool":"search_strings","args":{"query":"login"}},{"tool":"decompile_function","args":{"name":"nope"}},{"tool":"capture_process_scenario","args":{}}]}',
    '{"thought":"got it","done":[1],"tools":[{"tool":"decompile_function","args":{"name":"fn_login"}}]}',
    '{"final":"Login lives in fn_login at 0x401000 [#2]."}',
    '{"final":"Login is implemented in fn_login at 0x401000 [#2]; decompiled in [#3]. Not determined: the server side."}',
  ];
  const seen = []; let i = 0;
  const askAI = async (msgs, sys) => { seen.push({ n: msgs.length, sys }); return replies[i++]; };
  const events = [];
  const r = await reaInvestigate({ bytes: exe, name: 'a.exe', query: 'how does the login work', askAI, onStep: (e) => events.push(e) });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.steps, 3);                                   // open, search, decompile fn_login (repeat, error and denied tool do not count as evidence)
  assert.match(r.context, /PLAN:\n1\. Open the file/);
  assert.match(r.context, /VERIFIED FINDINGS:\nLogin is implemented in fn_login/);
  assert.match(r.context, /\[#2\] search_strings/);
  assert.ok(!/capture_process/.test(seen[0].sys), 'denied tools are never offered');
  const types = events.map((e) => e.type);
  for (const t of ['start', 'plan', 'tool', 'result', 'thought', 'verify', 'done']) assert.ok(types.includes(t), t);
  assert.ok(events.some((e) => e.type === 'result' && e.ok === false), 'the failed call is reported');
  assert.equal(events.filter((e) => e.type === "tool" && /^Searching/.test(e.label)).length, 1, 'the repeated search was not run twice');
});

import http from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {URL} from 'node:url';
import {execFile} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {callRebixModel,FREE_ENDPOINTS} from './rebix.mjs';
import {generateImage} from './imagegen.mjs';
import {PLANS,PLAN_DAYS,METHODS,methodsAvailable,publicPlans,flutterwaveCreate,flutterwaveVerify,flutterwaveWebhookOk,opayCreate,opayVerify,cryptoCreate,cryptoWebhookOk,cryptoVerifyPayment} from './payments.mjs';
import {usingPg,storeInit,storeLoad,storeSave,storeFilePut,storeFileGet} from './store.mjs';
import {searchImages,fetchImageBytes} from './imagesearch.mjs';
import {zipContext,isZipBytes} from './zipcontext.mjs';

try{process.loadEnvFile?.('.env')}catch{}
const ROOT=process.cwd(), DATA=path.join(ROOT,'data'), DB=path.join(DATA,'xyron.json'), PORT=Number(process.env.PORT||3000);
await mkdir(DATA,{recursive:true});
const empty={users:[],sessions:[],conversations:[],messages:[],codeFiles:[],subscriptions:[],feedback:[],tools:[],workflows:[],memories:[],activity:[],passwordResets:[],files:[],usage:[],apiKeys:[],fileTokens:[],emailCodes:[],signupTokens:[],broadcasts:[],broadcastAcks:[],orders:[]};
await storeInit();
const fromPg=await storeLoad();
let db=fromPg||(existsSync(DB)?JSON.parse(await readFile(DB,'utf8')):empty);
for(const k of Object.keys(empty)) if(!Array.isArray(db[k])) db[k]=[];
if(!db.settings||typeof db.settings!=='object'||Array.isArray(db.settings)) db.settings={};
// Legacy chat records created before entities were stamped with an owner did
// not have userId. When this database has a single user, safely associate those
// old conversations/messages with that account so existing history is not lost.
if(db.users.length===1){
 const legacyOwner=db.users[0].id;
 let migrated=false;
 for(const item of db.conversations) if(!item.userId){item.userId=legacyOwner;migrated=true}
 for(const item of db.messages) if(!item.userId){item.userId=legacyOwner;migrated=true}
 if(migrated&&!usingPg) await writeFile(DB,JSON.stringify(db,null,2));
}
const save=async()=>usingPg?storeSave(db):writeFile(DB,JSON.stringify(db,null,2));
// First boot on Postgres: copy the existing local data/xyron.json in so no accounts or chats are lost.
if(usingPg&&!fromPg){await save();console.log('Postgres: initial state saved'+(existsSync(DB)?' (seeded from data/xyron.json)':''))}
const limits={windowMs:60000,max:Number(process.env.RATE_LIMIT_PER_MINUTE)||120}; const hits=new Map();
function rate(req){const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'local').split(',')[0].trim();const t=Date.now();let x=hits.get(ip);if(!x||t-x.start>limits.windowMs)x={start:t,count:0};x.count++;hits.set(ip,x);return x.count<=limits.max}
function owned(type,item,u){if(!item)return false;if(type==='CodeFile')return item.userId===u.id;if(type==='User')return admin(u)&&item.id===u.id||admin(u);if(type==='Subscription')return item.userId===u.id||item.client_id===u.id||admin(u);return item.userId===u.id||item.owner_id===u.id||admin(u)}
function usageKey(u,kind){return `${u.id}:${kind}:${new Date().toISOString().slice(0,10)}`}
// Daily limits per plan. `free` is the number passed by each caller; paid plans use these.
const TIER_LIMITS={premium:{image:50,file:100,documentation:100},premium_plus:{image:200,file:500,documentation:Infinity}};
// A subscription the person actually has (paid or granted by an admin).
function realSub(u){const t=Date.now();return db.subscriptions.find(s=>(s.userId===u.id||s.client_id===u.id)&&s.status==='active'&&(!s.expires_at||Date.parse(s.expires_at)>t))}
// Admin switch: while on, every account gets Premium. Real subscriptions (e.g. Premium+) still win.
const freePremiumOn=()=>db.settings?.freePremium?.enabled===true;
function activeSub(u){return realSub(u)||(freePremiumOn()?{tier:'premium',status:'active',provider:'free_premium'}:null)}
function limitFor(u,kind,free){const s=activeSub(u);return s?(TIER_LIMITS[s.tier]?.[kind]??free):free}
function usageAllowed(u,kind,free=Infinity){if(admin(u))return true;const x=db.usage.find(v=>v.key===usageKey(u,kind));return (x?.count||0)<limitFor(u,kind,free)}
async function bumpUsage(u,kind,limit=Infinity){const k=usageKey(u,kind);let x=db.usage.find(v=>v.key===k);if(!x){x={key:k,userId:u.id,kind,count:0};db.usage.push(x)}if(!admin(u)&&x.count>=limitFor(u,kind,limit))return false;x.count++;await save();return true}
function mimeExt(m){return ({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','application/pdf':'.pdf','text/plain':'.txt','text/csv':'.csv','application/zip':'.zip','application/x-zip-compressed':'.zip'})[m]||'.bin'}
// Uploaded files are served from an authenticated route, so an external API
// (like the image reader below) can't fetch them with a session cookie.
// These short-lived tokens let us mint a one-off public link to a single
// file instead of making the whole /api/files route public.
function cleanFileTokens(){db.fileTokens=(db.fileTokens||[]).filter(t=>t.expires>Date.now())}
function mintFileToken(fileId){cleanFileTokens();const token=id();db.fileTokens.push({fileId,token,expires:Date.now()+5*60*1000});return token}
function originOf(req){return `${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`}
const id=()=>crypto.randomUUID(), now=()=>new Date().toISOString();
const hash=(p,s=crypto.randomBytes(16).toString('hex'))=>({salt:s,hash:crypto.scryptSync(p,s,64).toString('hex')});
const valid=(p,s,h)=>crypto.timingSafeEqual(Buffer.from(hash(p,s).hash,'hex'),Buffer.from(h,'hex'));
const cookie=(res,name,val,max=2592000)=>res.setHeader('Set-Cookie',`${name}=${val}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${max}`);
const parseCookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]}));
async function body(req){let s='';for await(const c of req)s+=c;if(!s)return{};try{return JSON.parse(s)}catch{return{}}}
async function send(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(data));}
function user(req){const sid=parseCookies(req).xyron_session; const s=db.sessions.find(x=>x.id===sid); return s?.userId?db.users.find(x=>x.id===s.userId):null}
// Admin = role "admin", or an email in ADMIN_EMAILS (env), or one of the built-in owner emails
// below once that email has been proven by an email code (emailVerified).
const OWNER_EMAILS=['eze464761@gmail.com','ezejessica876@gmail.com','inspirationdave94@gmail.com','loneradmin@gmail.com'];
const admin=u=>u&&(u.role==='admin'||(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(u.email.toLowerCase())||(u.emailVerified===true&&OWNER_EMAILS.includes(u.email.toLowerCase())));
function safeUser(u){if(!u)return null;const {passwordHash,passwordSalt,...x}=u;return x}
// `fallback:true` routes the call through the degraded/cost-saving endpoint
// instead of the primary provider â€” used once a free user is past their
// daily quota so they can keep chatting instead of being hard-blocked.
// `model` optionally overrides the default OPENAI_MODEL (used by Codex's
// model picker) and is ignored when fallback is active.
// ---------- Provider health + automatic switching ----------
// A provider that just failed or timed out is skipped for a minute, so one dead or
// slow endpoint cannot add a long wait to every single message.
const providerDown=new Map();
const healthy=name=>(providerDown.get(name)||0)<=Date.now();
const markBad=(name,ms=60000)=>providerDown.set(name,Date.now()+ms);
const FREE_AI_SWITCH_MS=Number(process.env.FREE_AI_SWITCH_MS)||3500;   // ask the next free provider too after this long
const FREE_AI_TIMEOUT_MS=Number(process.env.FREE_AI_TIMEOUT_MS)||20000; // give up on one free provider after this long
// Starts the first task now and each following one after `staggerMs` (or at once if
// the one before it fails). The first success wins and the others are cancelled.
function firstSuccess(tasks,staggerMs,ctl){
  return new Promise((resolve,reject)=>{
    let next=0,failed=0,done=false,timer=null;const errs=[],pending=new Set();
    const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);fn(v)};
    const launch=()=>{
      if(done||next>=tasks.length)return;
      const t=tasks[next++];
      pending.add(t);
      clearTimeout(timer);
      if(next<tasks.length)timer=setTimeout(launch,staggerMs);
      Promise.resolve().then(()=>t.run()).then(
        v=>{
          if(done)return;
          pending.delete(t);
          // Anyone still waiting when this one answered was too slow: skip it for a minute
          // so the next messages go straight to a provider that is answering.
          for(const slow of pending)markBad(slow.name);
          ctl?.abort();finish(resolve,v);
        },
        e=>{
          if(done)return; // cancelled because another provider already answered
          pending.delete(t);
          errs.push(`${t.name}: ${e.message}`);markBad(t.name);failed++;
          if(failed===tasks.length)finish(reject,Error(errs.join(' | ')));
          else if(next<tasks.length)launch(); // failed fast: switch right away
        });
    };
    launch();
  });
}
async function ai(messages,system='',{fallback=false,model,premium=false}={}){
  const userMessages=Array.isArray(messages)?messages:[];
  const chatMessages=[
    ...(system?[{role:'system',content:system}]:[]),
    ...userMessages.map(m=>({role:m.role==='assistant'?'assistant':'user',content:m.content||''})),
  ];
  // Vortyx Pulse and the free fallback proxy both take a single flat prompt
  // string rather than a messages array, so build that once and reuse it.
  const flatPrompt=[
    system?`System instructions:\n${system}`:'',
    ...userMessages.map(m=>`${m.role||'user'}: ${m.content||''}`)
  ].filter(Boolean).join('\n\n');

  // 1) Premium tier: Vortyx Pulse (single model "vortyx-1", single endpoint
  // POST /v1/chat, body {input}, reply in the "output" field per their docs).
  if(premium&&!fallback&&VORTYX_API_KEY&&healthy('vortyx')){
    try{
      const r=await fetch(`${VORTYX_API_URL}/chat`,{
        method:'POST',
        headers:{Authorization:`Bearer ${VORTYX_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({input:flatPrompt}),
        signal:AbortSignal.timeout(Number(process.env.VORTYX_TIMEOUT_MS)||20000),
      });
      const raw=await r.text();
      let j; try{j=JSON.parse(raw)}catch{j=null}
      if(!r.ok)throw Error(j?.error?.message||j?.error||`Vortyx Pulse API error (${r.status}): ${raw.slice(0,200)}`);
      const text=j?.output;
      if(text)return text;
      throw Error(`Vortyx Pulse returned an empty response. Raw: ${raw.slice(0,200)}`);
    }catch(e){
      // Don't fail the whole request just because the premium provider had
      // a hiccup — log it and drop through to the providers below.
      markBad('vortyx');console.error('Vortyx Pulse call failed, falling back:',e.message);
    }
  }

  // 2) A real, reliable provider via OPENAI_API_KEY (the same key already
  // used for image generation). This respects the resolved Codex model,
  // which the old free-proxy path silently ignored.
  if(process.env.OPENAI_API_KEY&&!fallback&&healthy('openai')){
    const chosenModel=model||process.env.OPENAI_MODEL||'gpt-4.1-mini';
    try{
      const r=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:chosenModel,messages:chatMessages}),
        signal:AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS)||30000),
      });
      const j=await r.json();
      if(!r.ok)throw Error(j.error?.message||`OpenAI API error (${r.status})`);
      const text=j.choices?.[0]?.message?.content;
      if(text)return text;
      throw Error('OpenAI returned an empty response');
    }catch(e){
      // Don't fail the whole request just because the primary provider had
      // a hiccup — log it and drop through to the free fallback below.
      markBad('openai');console.error('Primary AI provider failed, falling back:',e.message);
    }
  }

  // 3) Free providers (api-rebix): gptlogic, claude-haiku, claude-session, deepseek-v3.
  // They are raced with a staggered start: the first is asked right away, and if it
  // has not answered within FREE_AI_SWITCH_MS (or fails sooner) the next one is asked
  // too. The first good answer wins and the rest are cancelled. Change the order with
  // FREE_AI_ORDER (comma separated). Providers that just failed are skipped for 60s.
  const order=(process.env.FREE_AI_ORDER||'gptlogic,claude-haiku,claude-session,deepseek-v3').split(',').map(x=>x.trim()).filter(x=>FREE_ENDPOINTS.includes(x));
  const live=order.filter(n=>healthy('free:'+n));
  const names=live.length?live:order;
  const ctl=new AbortController();
  try{
    return await firstSuccess(names.map(n=>({name:'free:'+n,run:()=>callRebixModel(n,userMessages,system,{timeoutMs:FREE_AI_TIMEOUT_MS,signal:ctl.signal})})),FREE_AI_SWITCH_MS,ctl);
  }catch(e){
    console.error('All free AI providers failed:',e.message);
    throw Error('The AI service is busy right now. Please try again in a moment.');
  }
}// Server-side source of truth for whether this user currently has an
// active paid subscription (client-sent "isPremium" flags are never
// trusted for gating what the backend actually does).
function isPremiumUser(u){return Boolean(activeSub(u))}
// Codex's model picker (Xyron Pulse/Swift/Nexus/Luna/Vision) maps to real
// OpenAI model strings here, each overridable via env so an operator can
// point any tier at a stronger/cheaper model without code changes. Only
// Pulse and Swift are free; Nexus/Luna/Vision require an active subscription,
// enforced here (not just in the UI) so the client can't just pass the id.
const FREE_CODEX_MODELS=new Set(['vortyx_pulse','gpt_5_mini']);
const CODEX_MODEL_MAP={
  vortyx_pulse:process.env.MODEL_VORTYX_PULSE||process.env.OPENAI_MODEL||'gpt-4.1-mini',
  gpt_5_mini:process.env.MODEL_XYRON_SWIFT||'gpt-4.1-mini',
  claude_sonnet_4_6:process.env.MODEL_XYRON_NEXUS||'gpt-4.1',
  gpt_5_6_luna:process.env.MODEL_XYRON_LUNA||'gpt-4.1',
  gemini_3_1_pro:process.env.MODEL_XYRON_VISION||'gpt-4.1',
};
function resolveCodexModel(id,premium){
  if(!id||!CODEX_MODEL_MAP[id])return undefined;
  if(!premium&&!FREE_CODEX_MODELS.has(id))return undefined; // silently fall back to the default free model
  return CODEX_MODEL_MAP[id];
}
// Premium chat provider: Vortyx Pulse backend. Your live key is set as the
// default here so it works out of the box; set VORTYX_API_KEY in your server
// environment if you ever need to override it (e.g. to rotate the key)
// without editing this file.
const VORTYX_API_URL=process.env.VORTYX_API_URL||'https://vortyx-pulse-backend.onrender.com/v1';
const VORTYX_API_KEY=process.env.VORTYX_API_KEY||''; // set it in .env (never put keys in code)
// Image understanding for chat uploads. The main chat providers above are
// text-only, so uploaded images are routed through this free Gemini proxy
// and the description it gives back is folded into the normal chat context
// (see the xryonChat handler) so the main reply can talk about the image.
// NOTE: the proxy's docs only show a `q` text param
// (api-rebix.vercel.app/api/gemini?q=hello) — passing the image as a second
// `image` query param is my best guess at how it accepts one. If testing
// shows it ignores the image, adjust the param name here.
// Short-lived per-file cache prevents paying the image-analysis round trip on
// every follow-up message about the same uploaded image. Descriptions are generic
// so they can safely support different questions about that image.
const imageDescriptionCache = new Map();
const IMAGE_DESCRIPTION_TTL_MS = 10 * 60 * 1000;
async function cachedImageDescription(fileId, imageUrl) {
  const now = Date.now();
  const cached = imageDescriptionCache.get(fileId);
  if (cached && cached.expiresAt > now) return cached.description;
  if (cached) imageDescriptionCache.delete(fileId);
  const description = await readImage(imageUrl);
  imageDescriptionCache.set(fileId, { description, expiresAt: now + IMAGE_DESCRIPTION_TTL_MS });
  if (imageDescriptionCache.size > 500) {
    const oldestKey = imageDescriptionCache.keys().next().value;
    if (oldestKey) imageDescriptionCache.delete(oldestKey);
  }
  return description;
}
async function readImage(imageUrl,question=''){
  const apiUrl=process.env.GEMINI_API_URL||'https://api-rebix.vercel.app/api/gemini';
  const prompt=question?`${question}\n\n(Answer using the attached image. Mention any visible text that matters.)`:'Describe this image in detail, including any visible text.';
  // The provider only documents `?q=`. The image link is sent under several
  // common parameter names so whichever one it reads will pick it up.
  const qs=new URLSearchParams({q:prompt,image:imageUrl,url:imageUrl,imageUrl,image_url:imageUrl});
  let r,j,raw;
  try{
    r=await fetch(`${apiUrl}?${qs}`,{signal:AbortSignal.timeout(45000)});
    raw=await r.text();
    try{j=JSON.parse(raw)}catch{j=null}
  }catch(e){
    throw Error(`Could not reach the image-reading provider: ${e.message}`);
  }
  if(!r.ok)throw Error(j?.error||j?.message||`Image provider error (${r.status})`);
  if(j&&j.status===false)throw Error(j.error||j.message||'The image provider reported an error.');
  // This provider answers in the `message` field: {status,creator,message}.
  const text=j?(j.message||j.response||j.reply||j.text||j.result||j.answer):raw;
  if(!text||typeof text!=='string')throw Error('The image provider returned an empty response.');
  return text;
}
// ---------- Email code (sign-up / sign-in) ----------
// Codes are generated here on the server, stored only as a salted hash, expire
// after 10 minutes, and allow 5 wrong guesses. Delivery goes through Formspree
// (HTTP, no SMTP). Set FORMSPREE_ENDPOINT to override the form URL.
const FORMSPREE_ENDPOINT=process.env.FORMSPREE_ENDPOINT||'https://formspree.io/f/mppqqzrk';
const CODE_TTL=10*60*1000, SIGNUP_TTL=15*60*1000, CODE_MAX_TRIES=5, SEND_COOLDOWN=60*1000, SEND_PER_HOUR=5;
const sendLog=new Map();
const sha=(salt,code)=>crypto.createHash('sha256').update(salt+':'+code).digest('hex');
const emailOk=e=>/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e)&&e.length<=254;
function cleanAuthTables(){const t=Date.now();db.emailCodes=db.emailCodes.filter(c=>c.expires>t);db.signupTokens=db.signupTokens.filter(c=>c.expires>t)}
async function sendCodeEmail(email,code){
  if(process.env.NODE_ENV!=='production')console.log(`Xyron email code for ${email}: ${code}`);
  if(process.env.EMAIL_TRANSPORT==='console')return;
  const r=await fetch(FORMSPREE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({email,_subject:'Your Xyron verification code',subject:'Your Xyron verification code',code,message:`Your Xyron verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`})});
  if(!r.ok){const t=await r.text().catch(()=> '');throw Error(`Email provider error (${r.status}): ${t.slice(0,160)}`)}
}
function startSession(res,u){const sid=id();db.sessions.push({id:sid,userId:u.id,created_date:now()});cookie(res,'xyron_session',sid)}
// ---------- Broadcasts ----------
function cleanUrl(v){const s=String(v||'').trim().slice(0,500);if(!s)return null;if(s.startsWith('/')&&!s.startsWith('//')&&!s.includes('\\'))return s;try{const x=new URL(s);return ['http:','https:'].includes(x.protocol)?x.toString():null}catch{return null}}
// ---------- Google sign-in (OAuth 2.0 authorization-code flow) ----------
// Needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET. Set PUBLIC_URL to the address users open
// (http://localhost:5173 in dev, https://your-site.com in production) so the redirect URI
// is predictable: PUBLIC_URL + /api/auth/google/callback
const oauthStates=new Map();
const publicBase=req=>(process.env.PUBLIC_URL||originOf(req)).replace(/\/+$/,'');
const safePath=v=>{const s=String(v||'/');return s.startsWith('/')&&!s.startsWith('//')&&!s.includes('\\')&&s.length<500?s:'/'};
const oauthFail=(res,msg)=>{res.writeHead(302,{Location:'/login?oauth_error='+encodeURIComponent(msg),'Set-Cookie':'xyron_oauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});res.end()};
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.map':'application/json'};
const DIST=path.join(ROOT,'dist');
async function serveStatic(req,res,p){
 try{
  let rel;try{rel=decodeURIComponent(p)}catch{rel='/'}
  let file=path.normalize(path.join(DIST,rel));
  if(!file.startsWith(DIST))file=path.join(DIST,'index.html');
  let st=await stat(file).catch(()=>null);
  if(st&&st.isDirectory()){file=path.join(file,'index.html');st=await stat(file).catch(()=>null)}
  if(!st||!st.isFile()){file=path.join(DIST,'index.html');st=await stat(file).catch(()=>null)}
  if(!st){res.writeHead(503,{'Content-Type':'text/plain'});return res.end('Frontend not built. Run: npm run build')}
  const buf=await readFile(file);
  const ext=path.extname(file).toLowerCase();
  res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream','Content-Length':buf.length,'Cache-Control':rel.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
  res.end(req.method==='HEAD'?undefined:buf);
 }catch(e){console.error(e);res.writeHead(500,{'Content-Type':'text/plain'});res.end('Server error')}
}

// ---------- Anime gallery (api-rebix Pinterest feed) ----------
// The browser never talks to the feed or to the image hosts directly: the feed is fetched here,
// every image URL is wrapped in a signed same-origin proxy link, and "edit" copies the picture
// into the person's own files so the chat keeps working if the original disappears.
const ANIME_API=process.env.ANIME_API_URL||'https://api-rebix.vercel.app/api/pinterest';
function animeSecret(){if(!db.animeSecret){db.animeSecret=crypto.randomBytes(24).toString('hex');save().catch(()=>{})}return db.animeSecret}
const animeSign=u=>crypto.createHmac('sha256',animeSecret()).update(u).digest('hex').slice(0,32);
function animeSigOk(u,s){try{const a=Buffer.from(animeSign(String(u||''))),b=Buffer.from(String(s||''));return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}}
function animeHostOk(u){try{const x=new URL(u);if(x.protocol!=='https:')return false;const h=x.hostname.toLowerCase();if(h==='localhost'||h.endsWith('.local')||h.endsWith('.internal')||/^[\d.]+$/.test(h)||h.includes(':'))return false;return true}catch{return false}}
// Collects every plausible picture URL from whatever JSON shape the feed answers with.
function animeExtract(node,out=[],depth=0){
  if(out.length>=120||depth>7||node==null)return out;
  if(typeof node==='string'){
    if(/^https?:\/\//i.test(node)&&(/\.(jpe?g|png|webp)(\?|#|$)/i.test(node)||/pinimg\.com/i.test(node))&&!/\/avatars?\/|\/(30|45|60|75|140)x[^/]*\//i.test(node))out.push(node.replace(/^http:/i,'https:'));
    return out;
  }
  if(Array.isArray(node)){for(const v of node)animeExtract(v,out,depth+1);return out}
  if(typeof node==='object'){
    // prefer the explicit image-ish keys first so ordering stays meaningful
    for(const k of ['url','image','src','img','original','orig','large','media'])if(k in node)animeExtract(node[k],out,depth+1);
    for(const [k,v] of Object.entries(node))if(!['url','image','src','img','original','orig','large','media'].includes(k))animeExtract(v,out,depth+1);
  }
  return out;
}
const imageSearchHits=new Map();
const animeCache=new Map(); // q -> {at, images}
async function animeFeed(q){
  const hit=animeCache.get(q);if(hit&&Date.now()-hit.at<300000)return hit.images;
  const r=await fetch(`${ANIME_API}?q=${encodeURIComponent(q)}`,{headers:{'User-Agent':'XyronAnime/1.0',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}
  if(!r.ok)throw Error(`feed HTTP ${r.status}: ${raw.slice(0,160)}`);
  const seen=new Set();
  const urls=animeExtract(j??raw).filter(animeHostOk).filter(x=>{const k=/pinimg\.com/i.test(x)?(x.split('?')[0].split('/').pop()||x).replace(/\.[a-z0-9]+$/i,''):x;if(seen.has(k))return false;seen.add(k);return true});
  if(!urls.length)throw Error(`feed returned no images. Raw: ${raw.slice(0,200)}`);
  const images=urls.slice(0,60).map(u=>{const s=animeSign(u),qs=`u=${encodeURIComponent(u)}&s=${s}`;return{id:s,u,s,thumb:`/api/anime/img?${qs}`,full:`/api/anime/img?${qs}&full=1`}});
  animeCache.set(q,{at:Date.now(),images});if(animeCache.size>40)animeCache.delete(animeCache.keys().next().value);
  return images;
}
// Pinterest serves the same picture at several sizes (/236x/, /474x/, /736x/, /originals/).
// Grid tiles ask for a modest size, the viewer/edit asks for a larger one; either falls back to the URL as given.
function animeVariant(u,mode){
  return u.replace(/(i\.pinimg\.com\/)(originals|\d{2,3}x)(\d*)\//i,(m,host,size)=>{
    const n=size.toLowerCase()==='originals'?Infinity:parseInt(size,10);
    if(mode==='full')return n<736?`${host}736x/`:m;
    return n>474?`${host}474x/`:m;
  });
}
async function animeFetchBytes(u,mode){
  const v=animeVariant(u,mode);
  const tries=v!==u?[v,u]:[u];
  let last=Error('image unavailable');
  for(const t of tries){
    try{
      const r=await fetch(t,{headers:{'User-Agent':'Mozilla/5.0 (compatible; XyronAnime/1.0)',Referer:'https://www.pinterest.com/',Accept:'image/*'},signal:AbortSignal.timeout(20000),redirect:'follow'});
      const type=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!r.ok||!type.startsWith('image/')){last=Error(`HTTP ${r.status} ${type}`);continue}
      const bytes=Buffer.from(await r.arrayBuffer());
      if(bytes.length>15*1024*1024){last=Error('image too large');continue}
      return{mime:type,bytes};
    }catch(e){last=e}
  }
  throw last;
}
// ---------- Generated images ----------
async function loadInputImages(me,urls){
  const out=[];
  for(const raw of (Array.isArray(urls)?urls:[]).slice(0,3)){
    const s=String(raw||'');
    try{
      const m=/^\/api\/files\/([^/?]+)/.exec(s);
      if(m){
        const f=db.files.find(x=>x.id===m[1]&&x.userId===me.id);
        if(f&&f.mime?.startsWith('image/')){const bytes=usingPg?await storeFileGet(f.id):await readFile(f.path);if(bytes)out.push({mime:f.mime,bytes})}
        continue;
      }
      const d=/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(s);
      if(d&&d[2].length<15*1024*1024)out.push({mime:d[1],bytes:Buffer.from(d[2],'base64')});
    }catch(e){console.error('input image skipped:',e.message)}
  }
  return out;
}
async function saveGeneratedImage(me,mime,bytes){
  const clean=['image/png','image/jpeg','image/webp'].includes(mime)?mime:'image/png';
  const ext=mimeExt(clean),fileId=id(),dir=path.join(DATA,'uploads',me.id),fp=path.join(dir,fileId+ext);
  if(usingPg)await storeFilePut(fileId,bytes);else{await mkdir(dir,{recursive:true});await writeFile(fp,bytes)}
  db.files.unshift({id:fileId,userId:me.id,name:`xyron-image-${fileId.slice(0,8)}${ext}`,mime:clean,size:bytes.length,path:fp,created_date:now(),generated:true});
  await save();
  return `/api/files/${fileId}`;
}
// ---------- Premium payments (Flutterwave / OPay / crypto) ----------
const METHOD_LABEL={flutterwave:'Flutterwave',opay:'OPay',crypto:'Crypto'};
const orderRef=()=>'XYR-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
async function activateOrder(order){
  if(order.status==='paid')return;
  order.status='paid';order.paid_date=now();order.updated_date=now(); // set before any await so a webhook + return-page race can't double-activate
  const user=db.users.find(x=>x.id===order.userId);
  const cur=user&&realSub(user);
  const extend=cur&&cur.tier===order.tier&&cur.expires_at&&Date.parse(cur.expires_at)>Date.now();
  const start=extend?Date.parse(cur.expires_at):Date.now();
  for(const s of db.subscriptions)if((s.userId===order.userId||s.client_id===order.userId)&&s.status==='active')s.status='replaced';
  db.subscriptions.unshift({id:id(),userId:order.userId,client_id:order.userId,tier:order.tier,status:'active',provider:order.method,order_id:order.id,created_date:now(),updated_date:now(),expires_at:new Date(start+PLAN_DAYS*86400000).toISOString()});
  await save();
}
async function settleOrder(order,status){
  if(order.status==='paid')return;
  if(status==='paid')return activateOrder(order);
  if(status==='failed'&&order.status==='pending'){order.status='failed';order.updated_date=now();await save()}
}
// Ask the provider (never trust the browser or a webhook body) and update the order.
async function checkOrder(order){
  if(order.status==='paid')return 'paid';
  let st='pending';
  try{
    if(order.method==='flutterwave')st=await flutterwaveVerify(order);
    else if(order.method==='opay')st=await opayVerify(order);
    else return order.status; // crypto is confirmed by the signed IPN webhook
  }catch(e){console.error(`${order.method} verify failed:`,e.message)}
  await settleOrder(order,st);
  return order.status;
}
async function route(req,res){
 if(!rate(req))return send(res,429,{message:'Too many requests. Try again shortly.'},{'Retry-After':'60'});
 const u=new URL(req.url,`http://${req.headers.host}`), p=u.pathname, method=req.method, data=await body(req), me=user(req);
 if(p==='/api/health')return send(res,200,{ok:true,name:'Xyron',time:now()});
 // Payment webhooks: no session cookie, so each one is authenticated by the provider's signature
 // (or, for OPay, re-verified through its status API) before anything changes.
 if(p==='/api/payments/webhook/flutterwave'&&method==='POST'){
   if(!flutterwaveWebhookOk(req))return send(res,401,{message:'Bad signature'});
   const ref=String(data?.data?.tx_ref||data?.txRef||''),o=ref&&db.orders.find(x=>x.reference===ref&&x.method==='flutterwave');
   if(o)await checkOrder(o);
   return send(res,200,{ok:true});
 }
 if(p==='/api/payments/webhook/opay'&&method==='POST'){
   const ref=String(data?.payload?.reference||data?.reference||''),o=ref&&db.orders.find(x=>x.reference===ref&&x.method==='opay');
   if(o)await checkOrder(o);
   return send(res,200,{ok:true});
 }
 if(p==='/api/payments/webhook/nowpayments'&&method==='POST'){
   if(!cryptoWebhookOk(req,data))return send(res,401,{message:'Bad signature'});
   const o=db.orders.find(x=>x.id===String(data.order_id||'')&&x.method==='crypto');
   if(o&&o.status!=='paid'){let st='pending';try{st=await cryptoVerifyPayment(o,data.payment_id)}catch(e){console.error('crypto verify failed:',e.message)}await settleOrder(o,st)}
   return send(res,200,{ok:true});
 }
 if((method==='GET'||method==='HEAD')&&!p.startsWith('/api/'))return serveStatic(req,res,p);
 if(p==='/api/auth/register'&&method==='POST')return send(res,410,{message:'Password sign-up is closed. Sign up with an email code.'});
 if(p==='/api/auth/login'&&method==='POST'){const email=String(data.email||'').trim().toLowerCase(),u=db.users.find(x=>x.email===email);if(!u||!u.passwordHash||!valid(data.password||'',u.passwordSalt,u.passwordHash))return send(res,401,{message:'Invalid email or password'});if(u.banned)return send(res,403,{message:'Account is suspended.'});const sid=id();db.sessions.push({id:sid,userId:u.id,created_date:now()});await save();cookie(res,'xyron_session',sid);return send(res,200,{user:safeUser(u)});}
 if(p==='/api/auth/me')return me?send(res,200,{user:safeUser(me)}):send(res,401,{message:'Not authenticated'});
 if(p==='/api/auth/logout'&&method==='POST'){const sid=parseCookies(req).xyron_session;db.sessions=db.sessions.filter(x=>x.id!==sid);await save();cookie(res,'xyron_session','',0);return send(res,200,{ok:true});}
 if(p==='/api/auth/forgot-password'&&method==='POST'){const u=db.users.find(x=>x.email===String(data.email||'').trim().toLowerCase());if(u){const token=id();db.passwordResets.push({token,userId:u.id,expires:Date.now()+3600000});await save();console.log(`Xyron password reset token for ${u.email}: ${token}`)}return send(res,200,{ok:true});}
 if(p==='/api/auth/reset-password'&&method==='POST'){const x=db.passwordResets.find(r=>r.token===data.token&&r.expires>Date.now());if(!x)return send(res,400,{message:'Invalid or expired reset token'});const h=hash(data.password||'');const u=db.users.find(x=>x.id===x.userId);u.passwordHash=h.hash;u.passwordSalt=h.salt;db.passwordResets=db.passwordResets.filter(r=>r!==x);await save();return send(res,200,{ok:true});}
 if(p==='/api/auth/send-code'&&method==='POST'){
   const email=String(data.email||'').trim().toLowerCase();
   if(!emailOk(email))return send(res,400,{message:'Enter a valid email address.'});
   cleanAuthTables();
   const t=Date.now();const log=(sendLog.get(email)||[]).filter(x=>t-x<3600000);
   if(log.length&&t-log[log.length-1]<SEND_COOLDOWN)return send(res,429,{message:'Please wait a minute before asking for another code.'});
   if(log.length>=SEND_PER_HOUR)return send(res,429,{message:'Too many codes requested. Try again later.'});
   const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),salt=crypto.randomBytes(8).toString('hex');
   db.emailCodes=db.emailCodes.filter(c=>c.email!==email);
   db.emailCodes.push({email,salt,hash:sha(salt,code),expires:t+CODE_TTL,tries:0});
   try{await sendCodeEmail(email,code)}catch(e){db.emailCodes=db.emailCodes.filter(c=>c.email!==email);console.error('send-code failed:',e.message);return send(res,502,{message:'Could not send the code. Please try again.'})}
   log.push(t);sendLog.set(email,log);await save();
   return send(res,200,{ok:true});
 }
 if(p==='/api/auth/verify-code'&&method==='POST'){
   const email=String(data.email||'').trim().toLowerCase(),code=String(data.code||'').trim();
   cleanAuthTables();
   const c=db.emailCodes.find(x=>x.email===email);
   if(!c)return send(res,400,{message:'This code has expired. Request a new one.'});
   if(c.tries>=CODE_MAX_TRIES){db.emailCodes=db.emailCodes.filter(x=>x!==c);await save();return send(res,429,{message:'Too many wrong attempts. Request a new code.'})}
   const good=/^\d{6}$/.test(code)&&crypto.timingSafeEqual(Buffer.from(sha(c.salt,code),'hex'),Buffer.from(c.hash,'hex'));
   if(!good){c.tries++;await save();return send(res,400,{message:'Incorrect code. Check the email and try again.'})}
   db.emailCodes=db.emailCodes.filter(x=>x!==c);
   const existing=db.users.find(x=>x.email===email);
   if(existing){
     if(existing.banned){await save();return send(res,403,{message:'Account is suspended.'})}
     existing.emailVerified=true;startSession(res,existing);await save();return send(res,200,{user:safeUser(existing),isNew:false});
   }
   const signupToken=id();db.signupTokens.push({token:signupToken,email,expires:Date.now()+SIGNUP_TTL});await save();
   return send(res,200,{verified:true,isNew:true,signupToken});
 }
 if(p==='/api/auth/complete-signup'&&method==='POST'){
   cleanAuthTables();
   const t=db.signupTokens.find(x=>x.token===data.signupToken);
   if(!t)return send(res,400,{message:'Your verification expired. Start again.'});
   const name=String(data.name||'').replace(/\s+/g,' ').trim();
   if(name.length<2||name.length>40)return send(res,400,{message:'Enter your name (2-40 characters).'});
   if(data.acceptedTerms!==true)return send(res,400,{message:'You must accept the Terms and Conditions.'});
   if(db.users.some(x=>x.email===t.email))return send(res,409,{message:'An account with this email already exists.'});
   const nu={id:id(),email:t.email,full_name:name,role:'user',emailVerified:true,termsAcceptedAt:now(),created_date:now()};
   db.users.push(nu);db.signupTokens=db.signupTokens.filter(x=>x!==t);startSession(res,nu);await save();
   return send(res,201,{user:safeUser(nu)});
 }
 if(p==='/api/auth/google'&&method==='GET'){
   const cid=process.env.GOOGLE_CLIENT_ID;
   if(!cid||!process.env.GOOGLE_CLIENT_SECRET)return oauthFail(res,'Google sign-in is not set up yet.');
   const now_=Date.now();for(const [k,v] of oauthStates)if(v.exp<now_)oauthStates.delete(k);
   const state=crypto.randomBytes(20).toString('hex');oauthStates.set(state,{returnTo:safePath(u.searchParams.get('returnTo')),exp:now_+10*60*1000});
   const q=new URLSearchParams({client_id:cid,redirect_uri:publicBase(req)+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,prompt:'select_account'});
   res.writeHead(302,{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+q,'Set-Cookie':`xyron_oauth=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`});return res.end();
 }
 if(p==='/api/auth/google/callback'&&method==='GET'){
   const state=u.searchParams.get('state')||'',code=u.searchParams.get('code')||'';
   const st=oauthStates.get(state);oauthStates.delete(state);
   if(u.searchParams.get('error'))return oauthFail(res,'Google sign-in was cancelled.');
   if(!st||st.exp<Date.now()||parseCookies(req).xyron_oauth!==state||!code)return oauthFail(res,'Google sign-in expired. Please try again.');
   try{
     const tr=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(15000),
       body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:publicBase(req)+'/api/auth/google/callback',grant_type:'authorization_code'})});
     const tok=await tr.json();if(!tr.ok||!tok.access_token){console.error('google token error:',tok);return oauthFail(res,'Google sign-in failed. Check the server settings.')}
     const ir=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tok.access_token},signal:AbortSignal.timeout(15000)});
     const info=await ir.json();
     const email=String(info.email||'').toLowerCase();
     if(!ir.ok||!emailOk(email)||info.email_verified!==true)return oauthFail(res,'Your Google email is not verified.');
     let usr=db.users.find(x=>x.email===email);
     if(usr){if(usr.banned)return oauthFail(res,'Account is suspended.');usr.emailVerified=true;usr.googleId=info.sub}
     else{usr={id:id(),email,full_name:String(info.name||email.split('@')[0]).slice(0,40),role:'user',emailVerified:true,googleId:info.sub,created_date:now()};db.users.push(usr)}
     const sid=id();db.sessions.push({id:sid,userId:usr.id,created_date:now()});await save();
     res.writeHead(302,{Location:st.returnTo,'Set-Cookie':[`xyron_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,'xyron_oauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']});return res.end();
   }catch(e){console.error('google sign-in error:',e.message);return oauthFail(res,'Google sign-in failed. Please try again.')}
 }
 if(p.startsWith('/api/auth/')&&['google','github'].includes(p.split('/').pop()))return send(res,501,{message:'OAuth provider requires provider credentials; configure it in server environment.'});
 // The one exception to the auth gate below: a file GET carrying a valid,
 // short-lived token (minted server-side so an external image reader can
 // fetch a single upload without a session cookie).
 if(!me&&!(p.startsWith('/api/files/')&&method==='GET'&&u.searchParams.get('token')))return send(res,401,{message:'Authentication required'});
 if(p==='/api/files/upload'&&method==='POST'){const raw=String(data.data||'');if(!raw.startsWith('data:'))return send(res,400,{message:'Expected a data URL'});const match=raw.match(/^data:([^;]+);base64,(.+)$/);if(!match)return send(res,400,{message:'Invalid data URL'});if(match[2].length>15*1024*1024)return send(res,413,{message:'File too large'});if(!await bumpUsage(me,'file',5))return send(res,429,{message:'Daily file upload limit reached'});const ext=mimeExt(match[1]);const name=String(data.name||'upload') .replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100)+ext;const dir=path.join(DATA,'uploads',me.id);await mkdir(dir,{recursive:true});const fileId=id();const fp=path.join(dir,fileId+ext);const bytes=Buffer.from(match[2],'base64');if(usingPg)await storeFilePut(fileId,bytes);else await writeFile(fp,bytes);const f={id:fileId,userId:me.id,name,mime:match[1],size:Buffer.byteLength(match[2],'base64'),path:fp,created_date:now()};db.files.unshift(f);await save();return send(res,201,{file_url:`/api/files/${fileId}`,file:{id:fileId,name,mime:f.mime,size:f.size}})}
 if(p.startsWith('/api/files/')&&method==='GET'){
   const fid=p.split('/')[3];
   const token=u.searchParams.get('token');
   let f;
   if(token){cleanFileTokens();const t=db.fileTokens.find(x=>x.fileId===fid&&x.token===token);f=t&&db.files.find(x=>x.id===fid);}
   else f=db.files.find(x=>x.id===fid&&x.userId===me.id);
   if(!f)return send(res,404,{message:'File not found'});
   try{if(usingPg){const buf=await storeFileGet(f.id);if(!buf)return send(res,404,{message:'File unavailable'});res.writeHead(200,{'Content-Type':f.mime,'Content-Length':buf.length,'Content-Disposition':`inline; filename="${f.name}"`});return res.end(buf)}const st=await stat(f.path);res.writeHead(200,{'Content-Type':f.mime,'Content-Length':st.size,'Content-Disposition':`inline; filename="${f.name}"`});return pipeline((await import('node:fs')).createReadStream(f.path),res)}catch{return send(res,404,{message:'File unavailable'})}
 }
 if(p==='/api/broadcasts/pending'&&method==='GET'){
   const acked=new Set(db.broadcastAcks.filter(a=>a.userId===me.id).map(a=>a.broadcastId));
   const since=Math.max(Date.parse(me.created_date||0)||0,Date.now()-30*86400000);
   const items=db.broadcasts.filter(b=>!acked.has(b.id)&&Date.parse(b.created_date)>=since).sort((a,b)=>b.created_date.localeCompare(a.created_date)).slice(0,5).map(({id,title,message,url,created_date})=>({id,title,message,url,created_date}));
   return send(res,200,{broadcasts:items});
 }
 if(p==='/api/broadcasts/ack'&&method==='POST'){
   const bid=String(data.id||'');
   if(db.broadcasts.some(b=>b.id===bid)&&!db.broadcastAcks.some(a=>a.userId===me.id&&a.broadcastId===bid)){db.broadcastAcks.push({userId:me.id,broadcastId:bid,created_date:now()});await save()}
   return send(res,200,{ok:true});
 }
 if(p==='/api/broadcasts'&&method==='GET'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   return send(res,200,{broadcasts:db.broadcasts.slice().sort((a,b)=>b.created_date.localeCompare(a.created_date)).slice(0,50).map(b=>({...b,seenBy:db.broadcastAcks.filter(a=>a.broadcastId===b.id).length})),totalUsers:db.users.length});
 }
 if(p==='/api/broadcasts'&&method==='POST'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const message=String(data.message||'').trim().slice(0,500),title=String(data.title||'').trim().slice(0,80)||'Xyron';
   if(!message)return send(res,400,{message:'Write a message to broadcast.'});
   const b={id:id(),title,message,url:cleanUrl(data.url),created_by:me.id,created_date:now()};
   db.broadcasts.unshift(b);await save();return send(res,201,{broadcast:b});
 }
 if(p.startsWith('/api/broadcasts/')&&method==='DELETE'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const bid=p.split('/')[3];db.broadcasts=db.broadcasts.filter(b=>b.id!==bid);db.broadcastAcks=db.broadcastAcks.filter(a=>a.broadcastId!==bid);await save();return send(res,200,{ok:true});
 }
 if(p==='/api/memory'&&method==='GET')return send(res,200,{memories:db.memories.filter(x=>x.userId===me.id)});
 if(p==='/api/memory'&&method==='POST'){const x={id:id(),userId:me.id,...data,created_date:now(),updated_date:now()};db.memories.unshift(x);await save();return send(res,201,{memory:x})}
 if(p.startsWith('/api/memory/')&&method==='DELETE'){const mid=p.split('/')[3];db.memories=db.memories.filter(x=>!(x.id===mid&&x.userId===me.id));await save();return send(res,200,{ok:true})}
 if(p==='/api/feedback'&&method==='POST'){const type=data.type==='bug'?'bug':'feedback';const message=String(data.message||'').trim().slice(0,3000);if(message.length<3)return send(res,400,{message:'Please write a little more before sending.'});const recent=db.feedback.filter(x=>x.userId===me.id&&Date.now()-Date.parse(x.created_date)<600000);if(recent.length>=5&&!admin(me))return send(res,429,{message:'You have sent a lot of feedback recently. Please try again in a few minutes.'});const x={id:id(),type,message,page:String(data.page||'').slice(0,200),userId:me.id,email:me.email,name:me.full_name||'',status:'new',created_date:now(),updated_date:now()};db.feedback.unshift(x);await save();return send(res,201,{ok:true,item:x})}
 if(p==='/api/auth/profile'&&method==='POST'){const patch={};if(data.full_name!==undefined){const n=String(data.full_name).replace(/\s+/g,' ').trim();if(n.length<2||n.length>40)return send(res,400,{message:'Name must be 2-40 characters.'});patch.full_name=n}if(data.username!==undefined){const un=String(data.username).trim().toLowerCase().replace(/^@/,'');if(!/^[a-z0-9_.]{3,24}$/.test(un))return send(res,400,{message:'Username must be 3-24 letters, numbers, dots or underscores.'});if(db.users.some(x=>x.id!==me.id&&String(x.username||'').toLowerCase()===un))return send(res,409,{message:'That username is already taken.'});patch.username=un}if(data.profile_pic_url!==undefined){const pu=String(data.profile_pic_url||'');if(pu.length>2000)return send(res,400,{message:'Photo link is too long.'});patch.profile_pic_url=pu}Object.assign(me,patch,{updated_date:now()});await save();return send(res,200,{user:safeUser(me)})}
 if(p==='/api/auth/delete-account'&&method==='POST'){if(data.confirm!==true)return send(res,400,{message:'Confirmation required.'});if(admin(me))return send(res,403,{message:'Admin accounts cannot be deleted from here.'});const uid=me.id;const mine=x=>x.userId===uid||x.owner_id===uid||x.client_id===uid;db.conversations=db.conversations.filter(x=>!mine(x));db.messages=db.messages.filter(x=>!mine(x));db.codeFiles=db.codeFiles.filter(x=>!mine(x));db.memories=db.memories.filter(x=>!mine(x));db.subscriptions=db.subscriptions.filter(x=>!mine(x));db.usage=db.usage.filter(x=>x.userId!==uid);db.files=db.files.filter(x=>x.userId!==uid);db.sessions=db.sessions.filter(x=>x.userId!==uid);db.users=db.users.filter(x=>x.id!==uid);await save();cookie(res,'xyron_session','',0);return send(res,200,{ok:true})}
 // ---------- Image search for chat answers (keys stay in .env, the browser only sees signed same-origin links) ----------
 if(p==='/api/images/search'&&method==='GET'){
   const q=String(u.searchParams.get('q')||'').replace(/\s+/g,' ').trim().slice(0,120);
   if(q.length<2)return send(res,400,{message:'Missing search words.'});
   const bucket=Math.floor(Date.now()/60000),rk=`${me.id}:${bucket}`;
   imageSearchHits.set(rk,(imageSearchHits.get(rk)||0)+1);if(imageSearchHits.size>500)imageSearchHits.delete(imageSearchHits.keys().next().value);
   if(imageSearchHits.get(rk)>20&&!admin(me))return send(res,429,{message:'Too many image searches. Try again in a minute.'});
   try{
     const found=await searchImages(q,Number(u.searchParams.get('n'))||8);
     const sign=x=>`/api/images/img?u=${encodeURIComponent(x)}&s=${animeSign(x)}`;
     const images=found.filter(x=>animeHostOk(x.thumb)&&animeHostOk(x.full)).map(x=>({id:x.id,caption:x.caption,thumb:sign(x.thumb),full:sign(x.full),width:x.width||null,height:x.height||null,source:x.source,credit:x.credit,link:x.link&&/^https?:\/\//i.test(x.link)?x.link:null}));
     return send(res,200,{q,images});
   }catch(e){console.error('image search failed:',e.message);return send(res,502,{message:'Image search is unavailable right now.'})}
 }
 if(p==='/api/images/img'&&method==='GET'){
   const src=String(u.searchParams.get('u')||'');
   if(!animeSigOk(src,u.searchParams.get('s'))||!animeHostOk(src))return send(res,403,{message:'Bad image link'});
   try{const img=await fetchImageBytes(src);res.writeHead(200,{'Content-Type':img.mime,'Content-Length':img.bytes.length,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});return res.end(img.bytes)}
   catch(e){return send(res,502,{message:'Image unavailable'})}
 }
 if(p==='/api/anime'&&method==='GET'){
   let q=String(u.searchParams.get('q')||'anime').replace(/\s+/g,' ').trim().slice(0,60)||'anime';
   if(!/anime/i.test(q))q=`anime ${q}`;
   try{return send(res,200,{q,images:await animeFeed(q.toLowerCase())})}
   catch(e){console.error('anime feed failed:',e.message);return send(res,502,{message:'The anime feed is unavailable right now. Please try again in a moment.'})}
 }
 if(p==='/api/anime/img'&&method==='GET'){
   const src=String(u.searchParams.get('u')||'');
   if(!animeSigOk(src,u.searchParams.get('s'))||!animeHostOk(src))return send(res,403,{message:'Bad image link'});
   try{const img=await animeFetchBytes(src,u.searchParams.get('full')==='1'?'full':'thumb');res.writeHead(200,{'Content-Type':img.mime,'Content-Length':img.bytes.length,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});return res.end(img.bytes)}
   catch(e){return send(res,502,{message:'Image unavailable'})}
 }
 if(p==='/api/anime/import'&&method==='POST'){
   const src=String(data.u||'');
   if(!animeSigOk(src,data.s)||!animeHostOk(src))return send(res,403,{message:'Bad image link'});
   try{
     const img=await animeFetchBytes(src,'full');
     if(!['image/png','image/jpeg','image/webp'].includes(img.mime))return send(res,415,{message:'This picture format cannot be edited. Try another one.'});
     const url=await saveGeneratedImage(me,img.mime,img.bytes);
     return send(res,200,{file_url:url});
   }catch(e){console.error('anime import failed:',e.message);return send(res,502,{message:'Could not load that picture. Try another one.'})}
 }
 if(p==='/api/usage'&&method==='GET')return send(res,200,{usage:db.usage.filter(x=>x.userId===me.id)});

 if(p.startsWith('/api/entities/')){const type=p.split('/')[3];const map={Conversation:'conversations',Message:'messages',CodeFile:'codeFiles',Subscription:'subscriptions',User:'users',Feedback:'feedback'};const key=map[type];if(!key)return send(res,404,{message:'Unknown entity'});if(type==='CodeFile'){if(method==='POST'){if(String(data.content||'').length>1048576)return send(res,413,{message:'File is too large (1 MB max).'});if(db.codeFiles.filter(x=>x.userId===me.id).length>=300)return send(res,429,{message:'File limit reached (300). Delete some files first.'})}if(method==='PATCH'&&String(data.content||'').length>1048576)return send(res,413,{message:'File is too large (1 MB max).'})}if(type==='Subscription'&&method!=='GET'&&!admin(me))return send(res,403,{message:'Subscriptions are managed by the server.'});if(method==='GET'){if(key==='users'&&!admin(me))return send(res,403,{message:'Admin only'});let a=db[key];if(key!=='users'&&!(key==='feedback'&&admin(me))&&!(key==='subscriptions'&&admin(me)))a=a.filter(x=>owned(type,x,me));if(u.searchParams.get('filter')){const f=JSON.parse(u.searchParams.get('filter'));a=a.filter(x=>Object.entries(f).every(([k,v])=>x[k]===v))}return send(res,200,{items:a.map(x=>key==='users'?safeUser(x):x)});}if(method==='POST'){const x={id:id(),created_date:now(),updated_date:now(),...data};if(key!=='users')x.userId=me.id;if(key==='users'){const h=hash(data.password||crypto.randomBytes(12).toString('hex'));x.passwordHash=h.hash;x.passwordSalt=h.salt;delete x.password}db[key].unshift(x);await save();return send(res,201,{item:key==='users'?safeUser(x):x});}const itemId=u.searchParams.get('id');const item=db[key].find(x=>x.id===itemId);if(!item)return send(res,404,{message:'Item not found'});if(!owned(type,item,me))return send(res,403,{message:'Forbidden'});if(method==='PATCH'){Object.assign(item,data,{updated_date:now()});await save();return send(res,200,{item:key==='users'?safeUser(item):item})}if(method==='DELETE'){db[key]=db[key].filter(x=>x.id!==itemId);await save();return send(res,200,{ok:true})}}
 if(p==='/api/functions/xryonChat'&&method==='POST'){
   const premium=admin(me)||isPremiumUser(me);
   const k=usageKey(me,'ai');let x=db.usage.find(v=>v.key===k);if(!x){x={key:k,userId:me.id,kind:'ai',count:0};db.usage.push(x)}
   // Free users past their daily quota are switched to the fallback
   // endpoint/model instead of being cut off. `data.degraded` lets the
   // client pre-flag a message it already warned the user about.
   const overQuota=!premium&&x.count>=10;
   const useFallback=!premium&&(overQuota||data.degraded===true);
   x.count++;await save();
   let memoryContext='';
   if(!useFallback){const mem=db.memories.filter(m=>m.userId===me.id).slice(0,20);if(mem.length)memoryContext='\nRemembered context about this user:\n'+mem.map(m=>`- ${m.content||m.text||''}`).join('\n')}

   // Read any uploaded images through the Gemini proxy and fold what it sees
   // into the context, so the normal chat provider can answer questions
   // about them even though it's text-only itself.
   let imageContext='';
   const imageFileIds=Array.isArray(data.file_urls)?data.file_urls.map(fu=>{
     const m=/^\/api\/files\/([^/?]+)/.exec(String(fu||''));
     const f=m&&db.files.find(x=>x.id===m[1]&&x.userId===me.id);
     return f&&f.mime&&f.mime.startsWith('image/')?f.id:null;
   }).filter(Boolean).filter((fid,index,all)=>all.indexOf(fid)===index).slice(0,3):[];
   if(imageFileIds.length){
     const descriptions=await Promise.all(imageFileIds.map(async(fid)=>{
       try{
         const token=mintFileToken(fid);
         const publicUrl=`${originOf(req)}/api/files/${fid}?token=${token}`;
         return `- ${await cachedImageDescription(`${me.id}:${fid}`,publicUrl)}`;
       }catch(e){return `- (Could not read this image: ${e.message})`;}
     }));
     await save();
     imageContext='\nThe user attached image(s). Here is what they show:\n'+descriptions.join('\n');
   }

   // A .zip project attached to the chat: unpack it here and give the AI the file tree + key files,
   // so it can really work on the person's project (the app then offers the updated project as a ZIP).
   let zipCtx='';
   try{
     const zipIds=(Array.isArray(data.file_urls)?data.file_urls:[]).map(fu=>{const m=/^\/api\/files\/([^/?]+)/.exec(String(fu||''));return m&&m[1]}).filter(Boolean)
       .filter((fid,i,all)=>all.indexOf(fid)===i).map(fid=>db.files.find(x=>x.id===fid&&x.userId===me.id)).filter(f=>f&&!(f.mime||'').startsWith('image/')&&(f.size||0)<12*1024*1024).slice(0,2);
     const digests=[];
     for(const f of zipIds){
       const bytes=usingPg?await storeFileGet(f.id):await readFile(f.path);
       if(!bytes||!isZipBytes(bytes))continue;
       const d=await zipContext(bytes,f.id);
       if(d)digests.push(`ZIP PROJECT "${f.name.replace(/(\.zip)?(\.bin)?$/i,'')}.zip":\n${d}`);
     }
     if(digests.length)zipCtx='\nThe user attached a ZIP project. This is its content, read from the archive:\n'+digests.join('\n\n');
   }catch(e){console.error('zip read failed:',e.message)}

   try{
     const requestedModel=resolveCodexModel(data.model,premium);
     const reply=await ai(data.messages||[],`${data.persona||''}\n${data.system_prompt||''}${memoryContext}${imageContext}${zipCtx}`,{fallback:useFallback,model:requestedModel,premium});
     return send(res,200,{reply,limitReached:useFallback,memoryDisabled:useFallback});
   }catch(e){return send(res,502,{error:e.message})}
 }
 if(p==='/api/functions/vortyxFix'&&method==='POST'){try{return send(res,200,{reply:await ai([{role:'user',content:`Fix this ${data.language||'code'} code. Error: ${data.error||''}\n\n${data.code||''}`}],'',{premium:admin(me)||isPremiumUser(me)})})}catch(e){return send(res,502,{error:e.message})}}
 if(p==='/api/functions/generateImage'&&method==='POST'){
   // The browser never sees provider errors: any failure is answered with the generic
   // code "image_unavailable" and the chat shows the upgrade popup instead of an error.
   const prompt=String(data.prompt||'').trim().slice(0,4000);
   if(!prompt)return send(res,400,{error:'bad_request'});
   if(!usageAllowed(me,'image',5))return send(res,429,{error:'limit_reached'});
   try{
     const inputs=await loadInputImages(me,data.image_urls);
     const shortcut=String(data.shortcut||'').toLowerCase().slice(0,24); // only used to pick the provider
     const out=await generateImage(prompt,inputs,{shortcut});
     const url=await saveGeneratedImage(me,out.mime,out.bytes);
     await bumpUsage(me,'image',5); // only successful images count against the daily limit
     return send(res,200,{url});
   }catch(e){console.error('generateImage failed:',e.message);return send(res,502,{error:'image_unavailable'})}
 }
 if(p==='/api/premium/status'&&method==='GET'){const f=db.settings.freePremium||{};return send(res,200,{freePremium:{enabled:f.enabled===true,since:f.enabled===true?f.enabledAt||null:null}})}
 if(p==='/api/admin/free-premium'&&method==='POST'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const want=data.enabled===true,was=freePremiumOn();
   db.settings.freePremium={...(db.settings.freePremium||{}),enabled:want,...(want&&!was?{enabledAt:now(),enabledBy:me.email}:{}),...(!want&&was?{disabledAt:now(),disabledBy:me.email}:{})};
   // Turning it on tells every user right away: the existing broadcast popup picks this up within ~30s.
   if(want&&!was)db.broadcasts.unshift({id:id(),title:'Premium is free for everyone',message:'Xyron Premium is now unlocked for all users. Enjoy higher limits, advanced features and priority processing at no cost.',url:'/premium',created_by:me.id,created_date:now(),kind:'free_premium'});
   await save();
   return send(res,200,{freePremium:{enabled:want,since:want?db.settings.freePremium.enabledAt||null:null},notified:want&&!was});
 }
 if(p==='/api/admin/grant-premium'&&method==='POST'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const email=String(data.email||'').trim().toLowerCase(),tier=String(data.tier||'premium');
   if(!emailOk(email))return send(res,400,{message:'Enter a valid email address.'});
   if(!['premium','premium_plus'].includes(tier))return send(res,400,{message:'Choose Premium or Premium+.'});
   const days=Math.min(3650,Math.max(1,Math.floor(Number(data.days)||PLAN_DAYS)));
   const target=db.users.find(x=>String(x.email||'').toLowerCase()===email);
   if(!target)return send(res,404,{message:'No user with that email has signed up yet.'});
   for(const x of db.subscriptions)if((x.userId===target.id||x.client_id===target.id)&&x.status==='active')x.status='replaced';
   const sub={id:id(),userId:target.id,client_id:target.id,tier,status:'active',provider:'admin_grant',granted_by:me.email,created_date:now(),updated_date:now(),expires_at:new Date(Date.now()+days*86400000).toISOString()};
   db.subscriptions.unshift(sub);await save();
   return send(res,200,{ok:true,email:target.email,tier,expires_at:sub.expires_at});
 }
 if(p==='/api/admin/revoke-premium'&&method==='POST'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const email=String(data.email||'').trim().toLowerCase(),target=db.users.find(x=>String(x.email||'').toLowerCase()===email);
   if(!target)return send(res,404,{message:'No user with that email.'});
   let n=0;for(const x of db.subscriptions)if((x.userId===target.id||x.client_id===target.id)&&x.status==='active'){x.status='revoked';x.updated_date=now();n++}
   await save();return send(res,200,{ok:true,revoked:n});
 }
 if(p==='/api/payments/methods'&&method==='GET')return send(res,200,{methods:methodsAvailable(),plans:publicPlans(),admin:admin(me)});
 if(p==='/api/payments/start'&&method==='POST'){
   if(admin(me))return send(res,400,{message:'Admin access is free. No payment needed.'});
   const tier=String(data.tier||''),m=String(data.method||'');
   if(!PLANS[tier])return send(res,400,{message:'Choose a valid plan.'});
   if(!METHODS.includes(m))return send(res,400,{message:'Choose a valid payment method.'});
   if(!methodsAvailable()[m])return send(res,501,{message:`${METHOD_LABEL[m]} payments are not available yet.`});
   if(db.orders.filter(o=>o.userId===me.id&&Date.now()-Date.parse(o.created_date)<3600000).length>=10)return send(res,429,{message:'Too many payment attempts. Try again later.'});
   const order={id:id(),userId:me.id,tier,method:m,reference:orderRef(),amount:PLANS[tier].ngn,usd:PLANS[tier].usd(),status:'pending',created_date:now(),updated_date:now()};
   const base=publicBase(req),returnUrl=`${base}/premium?order=${order.id}`,cancelUrl=`${base}/premium?upgrade=canceled`;
   try{
     let out;
     if(m==='flutterwave')out=await flutterwaveCreate({order,user:me,returnUrl});
     else if(m==='opay')out=await opayCreate({order,user:me,returnUrl,callbackUrl:`${base}/api/payments/webhook/opay`,cancelUrl});
     else out=await cryptoCreate({order,returnUrl,callbackUrl:`${base}/api/payments/webhook/nowpayments`,cancelUrl});
     order.providerRef=out.providerRef||null;db.orders.unshift(order);await save();
     return send(res,200,{url:out.url,orderId:order.id});
   }catch(e){console.error('payment start failed:',e.message);return send(res,502,{message:'Could not start the payment. Please try again or pick another method.'})}
 }
 if(p==='/api/payments/verify'&&method==='GET'){
   const order=db.orders.find(o=>o.id===u.searchParams.get('order')&&o.userId===me.id);
   if(!order)return send(res,404,{message:'Order not found'});
   const status=await checkOrder(order);
   return send(res,200,{status,tier:order.tier,method:order.method});
 }
 if(p==='/api/functions/adminStats'&&method==='POST'){if(!admin(me))return send(res,403,{message:'Admin only'});return send(res,200,{stats:{totalUsers:db.users.length,totalConversations:db.conversations.length,totalMessages:db.messages.length,totalCodeFiles:db.codeFiles.length,totalFeedback:db.feedback.length},users:db.users.map(u=>{const sb=realSub(u);return {...safeUser(u),premium:sb?{tier:sb.tier,expires_at:sb.expires_at||null,provider:sb.provider||null}:null}}),feedback:db.feedback.slice(0,200),freePremium:{enabled:freePremiumOn(),since:db.settings.freePremium?.enabledAt||null}})}
 if(p==='/api/functions/createCheckout'&&method==='POST')return send(res,410,{error:'Checkout moved to /api/payments/start.'});
 if(p==='/api/intelligence/plan'&&method==='POST'){const reply=await ai([{role:'user',content:`Create a safe execution plan for this goal. Return concise JSON-like steps and required tools: ${data.goal}`}]);const item={id:id(),userId:me.id,goal:data.goal,plan:reply,status:'planned',created_date:now()};db.activity.unshift(item);await save();return send(res,200,{plan:item});}
 if(p==='/api/intelligence/tools'&&method==='GET')return send(res,200,{tools:db.tools.filter(x=>x.userId===me.id)});
 if(p==='/api/intelligence/tools'&&method==='POST'){const x={id:id(),userId:me.id,...data,created_date:now()};db.tools.unshift(x);await save();return send(res,201,{tool:x});}
 if(p==='/api/intelligence/workflows'&&method==='GET')return send(res,200,{workflows:db.workflows.filter(x=>x.userId===me.id)});
 if(p==='/api/intelligence/workflows'&&method==='POST'){const x={id:id(),userId:me.id,...data,created_date:now()};db.workflows.unshift(x);await save();return send(res,201,{workflow:x});}
 if(p==='/api/intelligence/research'&&method==='POST'){if(!await bumpUsage(me,'documentation',5))return send(res,429,{error:'Daily research/documentation limit reached'});try{const target=new URL(data.url);if(!['http:','https:'].includes(target.protocol))throw Error('Only HTTP(S) URLs are allowed');const r=await fetch(target,{headers:{'User-Agent':'XyronResearch/1.0'},signal:AbortSignal.timeout(10000)});const text=(await r.text()).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,20000);return send(res,200,{url:data.url,status:r.status,text})}catch(e){return send(res,400,{error:e.message})}}
 if(p==='/api/intelligence/run-code'&&method==='POST'){if(!admin(me)&&process.env.ENABLE_CODE_RUNNER!=='true')return send(res,403,{error:'Code runner disabled. Enable it explicitly on the server.'});if(data.language!=='javascript')return send(res,400,{error:'Only JavaScript is supported by this runner.'});const code=String(data.code||'').slice(0,20000);return new Promise(resolve=>{execFile(process.execPath,['--input-type=module','-e',code],{timeout:5000,maxBuffer:200000},(error,stdout,stderr)=>{send(res,error?400:200,{stdout,stderr,error:error?.message||null}).then(resolve)})})}
 if(p==='/api/intelligence/activity'&&method==='GET')return send(res,200,{activity:db.activity.filter(x=>x.userId===me.id).slice(0,100)});
 return send(res,404,{message:'Not found'});
}
const server=http.createServer((req,res)=>route(req,res).catch(e=>{console.error(e);send(res,500,{message:'Internal server error'})}));server.listen(PORT,()=>console.log(`Xyron backend listening on http://localhost:${PORT}`));


import { callNexus, nexusConfigured } from './nexus.mjs';
import { charartReadImage, charartChat, buildChatPrompt, isCharartMode } from './charart.mjs';
import { parseTextImage, makeTextImage } from './textimage.mjs';
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
import {webSearch,searchQueryFrom,buildWebContext} from './websearch.mjs';
import {zipContext,isZipBytes} from './zipcontext.mjs';
import {musicSearch,musicTrending,musicTrack,streamUpstream,generateSong,lyriaConfigured} from './music.mjs';
import { smtpConfigured, sendSmtp } from './smtp.mjs';
import { generateVapidKeys, sendPush, isAllowedEndpoint } from './push.mjs';

try{process.loadEnvFile?.('.env')}catch{}
const ROOT=process.cwd(), DATA=path.join(ROOT,'data'), DB=path.join(DATA,'xyron.json'), PORT=Number(process.env.PORT||3000);
let handler=(req,res)=>{res.writeHead(503,{'Content-Type':'application/json','Retry-After':'5'});res.end(JSON.stringify({message:'Xyron is starting up, try again in a few seconds'}))};
const server=http.createServer((req,res)=>handler(req,res));
server.listen(PORT,'0.0.0.0',()=>console.log(`Xyron backend listening on port ${PORT} (starting up)`));
await mkdir(DATA,{recursive:true});
const empty={users:[],sessions:[],conversations:[],messages:[],codeFiles:[],subscriptions:[],feedback:[],tools:[],workflows:[],memories:[],activity:[],passwordResets:[],files:[],usage:[],apiKeys:[],fileTokens:[],emailCodes:[],signupTokens:[],broadcasts:[],broadcastAcks:[],orders:[],pushSubs:[]};
for(let attempt=1;;attempt++){try{await storeInit();break}catch(e){console.error(`Postgres connection failed (attempt ${attempt}): ${e.code||e.errors?.[0]?.code||e.message}. Retrying...`);await new Promise(r=>setTimeout(r,Math.min(30000,2000*attempt)))}}
const fromPg=await storeLoad();
let db=fromPg||(existsSync(DB)?JSON.parse(await readFile(DB,'utf8')):empty);
for(const k of Object.keys(empty)) if(!Array.isArray(db[k])) db[k]=[];
if(!db.settings||typeof db.settings!=='object'||Array.isArray(db.settings)) db.settings={};
// ---------- Web Push (broadcast notifications when the site is closed) ----------
// VAPID keys: set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY to pin your own, otherwise a pair is created once and kept in the database.
if(!(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)&&!(db.settings.vapid?.publicKey&&db.settings.vapid?.privateKey)){db.settings.vapid=generateVapidKeys();db.__vapidNew=true}
const vapidKeys=()=>process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY?{publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY}:db.settings.vapid;
let vapidSubjectGuess='';
const vapidSubject=()=>process.env.VAPID_SUBJECT||(/^https:\/\//.test(process.env.PUBLIC_URL||'')?process.env.PUBLIC_URL:'')||vapidSubjectGuess||'mailto:admin@xyron.app';
async function pushToAll(payload){
  const subs=db.pushSubs.slice();let sent=0,failed=0;const dead=new Set();
  for(let i=0;i<subs.length;i+=20){
    await Promise.all(subs.slice(i,i+20).map(async sub=>{
      const r=await sendPush(sub,payload,{vapid:vapidKeys(),subject:vapidSubject()});
      if(r.ok)sent++;else{failed++;if(r.gone)dead.add(sub.endpoint)}
    }));
  }
  if(dead.size){db.pushSubs=db.pushSubs.filter(x=>!dead.has(x.endpoint));await save()}
  return {sent,failed,removed:dead.size};
}
const pushBroadcast=b=>pushToAll({id:b.id,title:b.title||'Xyron',body:b.message,url:b.url||'/'}).then(r=>console.log(`Broadcast push: ${r.sent} sent, ${r.failed} failed, ${r.removed} removed`)).catch(e=>console.error('Broadcast push error:',e.message));
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
if(db.__vapidNew){delete db.__vapidNew;await save()}
// First boot on Postgres: copy the existing local data/xyron.json in so no accounts or chats are lost.
if(usingPg&&!fromPg){await save();console.log('Postgres: initial state saved'+(existsSync(DB)?' (seeded from data/xyron.json)':''))}
const limits={windowMs:60000,max:Number(process.env.RATE_LIMIT_PER_MINUTE)||120}; const hits=new Map();
function rate(req){const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'local').split(',')[0].trim();const t=Date.now();let x=hits.get(ip);if(!x||t-x.start>limits.windowMs)x={start:t,count:0};x.count++;hits.set(ip,x);return x.count<=limits.max}
function owned(type,item,u){if(!item)return false;if(type==='Conversation'||type==='Message')return item.userId===u.id||item.owner_id===u.id;if(type==='CodeFile')return item.userId===u.id;if(type==='User')return admin(u)&&item.id===u.id||admin(u);if(type==='Subscription')return item.userId===u.id||item.client_id===u.id||admin(u);return item.userId===u.id||item.owner_id===u.id||admin(u)}
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
function mimeExt(m){return ({'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','application/pdf':'.pdf','text/plain':'.txt','text/csv':'.csv','application/zip':'.zip','application/x-zip-compressed':'.zip','audio/mpeg':'.mp3','audio/mp3':'.mp3','audio/wav':'.wav','audio/x-wav':'.wav'})[m]||'.bin'}
// Uploaded files are served from an authenticated route, so an external API
// (like the image reader below) can't fetch them with a session cookie.
// These short-lived tokens let us mint a one-off public link to a single
// file instead of making the whole /api/files route public.
function cleanFileTokens(){db.fileTokens=(db.fileTokens||[]).filter(t=>t.expires>Date.now())}
function mintFileToken(fileId){cleanFileTokens();const token=id();db.fileTokens.push({fileId,token,expires:Date.now()+15*60*1000});return token}
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
const admin=u=>u&&(u.role==='admin'||(process.env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).includes(String(u.email||'').toLowerCase())||(u.emailVerified===true&&OWNER_EMAILS.includes(String(u.email||'').toLowerCase())));
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
async function ai(messages,system='',{fallback=false,model,premium=false,prefer,vortyx=false,nexus=false,onNexusFail,codex=false,onToken,signal}={}){
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

  // Codex has a dedicated coding provider chain: claude-session first, then
  // claude-haiku only if the primary endpoint fails or returns no usable text.
  // These endpoints accept one q parameter; callRebixModel handles URL sizing,
  // response parsing, timeout handling and endpoint URL overrides.
  if(codex){
    const codexSystem=[
      'You are Xryon Codex, a careful software-engineering assistant.',
      'Keep all work organized by exact file path and filename.',
      'When creating or changing a project, provide complete file contents where practical; never use placeholders such as \"rest of code here\".',
      'Preserve existing behavior and dependencies unless the user explicitly asks to change them.',
      'Explain briefly what each file does and list setup, run, and test commands when relevant.',
      'Do not claim you ran code or tests unless tools actually ran them.',
      'Use fenced code blocks with the correct language and clear headings.'
    ].join('\n');
    const prompt=[codexSystem,system].filter(Boolean).join('\n\n');
    const timeoutMs=Number(process.env.CODEX_AI_TIMEOUT_MS)||45000;
    // Xryon Nexus AI selected in Codex: ask Nexus first. If it fails, the normal Codex chain below answers
    // instead (and onNexusFail lets the caller give the person their try back).
    if(nexus&&nexusConfigured()&&healthy('nexus')){
      try{
        const codexFlat=`${prompt}\n\n${userMessages.map(m=>`${m.role||'user'}: ${m.content||''}`).join('\n\n')}`;
        const answer=await callNexus(codexFlat,{timeoutMs,signal});
        if(typeof onToken==='function')onToken(answer);
        return answer;
      }catch(e){
        markBad('nexus');console.warn('Nexus AI (Codex) failed, using the normal Codex chain:',e.message);
        if(typeof onNexusFail==='function')onNexusFail();
      }
    }else if(nexus&&typeof onNexusFail==='function')onNexusFail();
    try{
      const answer=await callRebixModel('claude-session',userMessages,prompt,{timeoutMs,signal});
      if(typeof onToken==='function')onToken(answer);
      return answer;
    }catch(primaryError){
      markBad('free:claude-session');
      console.warn('Codex primary claude-session endpoint failed; trying claude-haiku:',primaryError.message);
      try{
        const answer=await callRebixModel('claude-haiku',userMessages,prompt,{timeoutMs,signal});
        if(typeof onToken==='function')onToken(answer);
        return answer;
      }catch(fallbackError){
        markBad('free:claude-haiku');
        console.error('Codex primary and fallback endpoints failed:',fallbackError.message);
        throw Error('Xryon Codex is temporarily unavailable. Please retry in a moment.');
      }
    }
  }

  // 0) Nexus AI chat model (Settings -> Model -> Nexus AI). Skipped when the person is over their daily quota
  // (fallback) and, if Nexus fails, the normal chain below answers instead.
  if(nexus&&!fallback&&nexusConfigured()&&healthy('nexus')){
    try{
      const answer=await callNexus(flatPrompt,{signal});
      if(typeof onToken==='function')onToken(answer);
      return answer;
    }catch(e){markBad('nexus');console.warn('Nexus AI failed, falling back:',e.message)}
  }

  // 1) Premium tier: Vortyx Pulse (single model "vortyx-1", single endpoint
  // POST /v1/chat, body {input}, reply in the "output" field per their docs).
  if((premium||vortyx)&&!fallback&&VORTYX_API_KEY&&healthy('vortyx')){
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
    const streaming=typeof onToken==='function';
    let emitted=0; // characters already sent to the client; after that we can't silently switch provider
    try{
      const timeout=AbortSignal.timeout(streaming?(Number(process.env.OPENAI_STREAM_TIMEOUT_MS)||180000):(Number(process.env.OPENAI_TIMEOUT_MS)||30000));
      const r=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:chosenModel,messages:chatMessages,...(streaming?{stream:true}:{})}),
        signal:signal&&AbortSignal.any?AbortSignal.any([timeout,signal]):timeout,
      });
      if(streaming){
        if(!r.ok){const ej=await r.json().catch(()=>({}));throw Error(ej.error?.message||`OpenAI API error (${r.status})`)}
        const reader=r.body.getReader();const dec=new TextDecoder();let buf='',full='';
        for(;;){
          const {done,value}=await reader.read();if(done)break;
          buf+=dec.decode(value,{stream:true});
          let nl;
          while((nl=buf.indexOf('\n'))>=0){
            const line=buf.slice(0,nl).trim();buf=buf.slice(nl+1);
            if(!line.startsWith('data:'))continue;
            const payload=line.slice(5).trim();if(payload==='[DONE]')continue;
            try{const d=JSON.parse(payload).choices?.[0]?.delta?.content;if(d){full+=d;emitted+=d.length;onToken(d)}}catch{}
          }
        }
        if(full)return full;
        throw Error('OpenAI returned an empty response');
      }
      const j=await r.json();
      if(!r.ok)throw Error(j.error?.message||`OpenAI API error (${r.status})`);
      const text=j.choices?.[0]?.message?.content;
      if(text)return text;
      throw Error('OpenAI returned an empty response');
    }catch(e){
      // Don't fail the whole request just because the primary provider had
      // a hiccup — log it and drop through to the free fallback below.
      if(emitted>0)throw e; // part of the answer is already on the client's screen: report the failure instead of restarting
      markBad('openai');console.error('Primary AI provider failed, falling back:',e.message);
    }
  }

  // 3) Free providers (api-rebix): gptlogic, claude-haiku, claude-session, deepseek-v3.
  // They are raced with a staggered start: the first is asked right away, and if it
  // has not answered within FREE_AI_SWITCH_MS (or fails sooner) the next one is asked
  // too. The first good answer wins and the rest are cancelled. Change the order with
  // FREE_AI_ORDER (comma separated). Providers that just failed are skipped for 60s.
  const baseOrder=(process.env.FREE_AI_ORDER||'gptlogic,claude-haiku,claude-session,deepseek-v3').split(',').map(x=>x.trim()).filter(x=>FREE_ENDPOINTS.includes(x));
  // A chat model may prefer one backup endpoint first; every other endpoint stays in the list as failover.
  const order=prefer&&baseOrder.includes(prefer)?[prefer,...baseOrder.filter(x=>x!==prefer)]:baseOrder;
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
// Chat model picker (Settings -> Model). The original three (Xyron Plus / 4.1 / Vortex) are not listed here,
// so they behave exactly as before. Each model below adds a short style note to the system prompt and,
// for the free backup stage, asks one of the existing backup endpoints first - the full failover chain
// (Vortyx -> OpenAI -> every free endpoint) is unchanged. Premium-only models are enforced here too.
const UI_MODELS={
  'Xyron Opus':{premium:true,prefer:'claude-session',style:'Respond as Xyron Opus: handle advanced reasoning and complex, multi-part projects. Plan first, then give a thorough, well-organised answer.'},
  'Xyron Code':{prefer:'deepseek-v3',style:'Respond as Xyron Code: focus on building, debugging and editing software. Give complete, working code in fenced blocks and explain fixes briefly.'},
  'Xyron Reason':{prefer:'deepseek-v3',style:'Respond as Xyron Reason: focus on logic, mathematics and deep analysis. Work step by step and state the final answer clearly.'},
  'Xyron Flash':{vortyx:true,prefer:'claude-haiku',style:'Respond as Xyron Flash: fast everyday assistance. Keep answers short and direct; add detail only when it is needed.'},
  'Xyron Scholar':{prefer:'claude-haiku',style:'Respond as Xyron Scholar: help with learning, tutoring and research. Explain clearly with examples and build understanding step by step.'},
  'Xyron Sentinel':{prefer:'claude-session',style:'Respond as Xyron Sentinel: audit code and review security defensively. List issues by severity with the reason and a concrete fix for each.'},
  'Nexus AI':{premium:true,nexus:true,prefer:'claude-session',style:'Respond as Nexus AI: a capable, balanced assistant for questions, writing, analysis and code. Be clear and accurate, and keep answers as short as the question allows.'},
  'Xyron Creative':{prefer:'gptlogic',style:'Respond as Xyron Creative: help with writing, ideas and creative tasks. Be vivid, original and offer a few directions when useful.'},
};
function resolveUiModel(name,premium){
  const m=typeof name==='string'?UI_MODELS[name]:null;
  if(!m||(m.premium&&!premium))return null; // unknown or locked: behave as the default model
  return m;
}
// Codex's model picker (Xyron Pulse/Swift/Nexus/Luna/Vision) maps to real
// OpenAI model strings here, each overridable via env so an operator can
// point any tier at a stronger/cheaper model without code changes. Only
// Pulse and Swift are free; Nexus/Luna/Vision require an active subscription,
// enforced here (not just in the UI) so the client can't just pass the id.
const FREE_CODEX_MODELS=new Set(['vortyx_pulse','gpt_5_mini','claude_sonnet_4_6']); // Xyron Nexus is free but limited for non-premium users, see codexNexusGate()
const CODEX_MODEL_MAP={
  vortyx_pulse:process.env.MODEL_VORTYX_PULSE||process.env.OPENAI_MODEL||'gpt-4.1-mini',
  gpt_5_mini:process.env.MODEL_XYRON_SWIFT||'gpt-4.1-mini',
  claude_sonnet_4_6:process.env.MODEL_XYRON_NEXUS||'gpt-4.1', // Xyron Nexus: answered by the Nexus AI endpoint (nexus.mjs) first
  gpt_5_6_luna:process.env.MODEL_XYRON_LUNA||'gpt-4.1',
  gemini_3_1_pro:process.env.MODEL_XYRON_VISION||'gpt-4.1',
};
// Free users get CODEX_NEXUS_FREE_LIMIT (10) Xyron Nexus (Nexus AI) coding requests per CODEX_NEXUS_WINDOW_HOURS (5) hours.
// The window starts at their first Nexus request and resets 5 hours later. When the 10 are used, the request
// is answered by Xryon Swift instead (automatically) until the window resets. Premium and admins are unlimited.
const CODEX_NEXUS_FREE_LIMIT=Number(process.env.CODEX_NEXUS_FREE_LIMIT)||10;
const CODEX_NEXUS_WINDOW_MS=(Number(process.env.CODEX_NEXUS_WINDOW_HOURS)||5)*3600*1000;
// Returns {useNexus, model, meta}. `model` is the Codex model id that really answers; `refund()` gives a try back.
async function codexNexusGate(me,data,premium){
  if(data.codex!==true||data.model!=='claude_sonnet_4_6')return {useNexus:false,model:data.model,meta:null,refund:()=>{}};
  if(premium)return {useNexus:true,model:'claude_sonnet_4_6',meta:{model:'claude_sonnet_4_6',unlimited:true},refund:()=>{}};
  const k=`${me.id}:codex_nexus`;let x=db.usage.find(v=>v.key===k);
  const t=Date.now();
  if(!x){x={key:k,userId:me.id,kind:'codex_nexus',count:0,windowStart:t};db.usage.push(x)}
  if(!x.windowStart||t-x.windowStart>=CODEX_NEXUS_WINDOW_MS){x.count=0;x.windowStart=t}
  const resetAt=new Date(x.windowStart+CODEX_NEXUS_WINDOW_MS).toISOString();
  if(x.count>=CODEX_NEXUS_FREE_LIMIT){
    await save();
    return {useNexus:false,model:'gpt_5_mini',meta:{model:'gpt_5_mini',switched:true,from:'claude_sonnet_4_6',remaining:0,limit:CODEX_NEXUS_FREE_LIMIT,resetAt},refund:()=>{}};
  }
  x.count++;await save();
  const window0=x.windowStart;
  return {useNexus:true,model:'claude_sonnet_4_6',meta:{model:'claude_sonnet_4_6',remaining:CODEX_NEXUS_FREE_LIMIT-x.count,limit:CODEX_NEXUS_FREE_LIMIT,resetAt},
    refund:()=>{if(x.windowStart===window0&&x.count>0){x.count--;save().catch(()=>{})}}}; // a failed Nexus call does not use up a try
}
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
async function cachedImageDescription(fileId, imageUrl, question = '') {
  const now = Date.now();
  const key = question ? `${fileId}|${crypto.createHash('sha1').update(question).digest('hex').slice(0, 12)}` : fileId;
  const cached = imageDescriptionCache.get(key);
  if (cached && cached.expiresAt > now) return cached.description;
  if (cached) imageDescriptionCache.delete(key);
  const description = await readImage(imageUrl, question);
  imageDescriptionCache.set(key, { description, expiresAt: now + IMAGE_DESCRIPTION_TTL_MS });
  if (imageDescriptionCache.size > 500) {
    const oldestKey = imageDescriptionCache.keys().next().value;
    if (oldestKey) imageDescriptionCache.delete(oldestKey);
  }
  return description;
}
// ChatArt reads images first (it answers questions in the image and follows the user's caption);
// the older Gemini proxy below is only the fallback if ChatArt is down.
async function readImage(imageUrl, question = '') {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try { return await charartReadImage(imageUrl, question); }
    catch (e) { console.error(`ChatArt image read failed (attempt ${attempt}):`, e.message); await new Promise(r => setTimeout(r, 1200)); }
  }
  try { return await readImageGemini(imageUrl, question); }
  catch (e) { console.error('Fallback image read failed:', e.message); throw e; }
}
async function readImageGemini(imageUrl,question=''){
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
// (HTTP, no SMTP). Set BREVO_API_KEY (+ BREVO_FROM_EMAIL) to send through Brevo, or RESEND_API_KEY for Resend.
// Set FORMSPREE_ENDPOINT to override the form URL.
const FORMSPREE_ENDPOINT=process.env.FORMSPREE_ENDPOINT||'https://formspree.io/f/mppqqzrk';
const CODE_TTL=10*60*1000, SIGNUP_TTL=15*60*1000, CODE_MAX_TRIES=5, SEND_COOLDOWN=60*1000, SEND_PER_HOUR=5;
const sendLog=new Map();
const sha=(salt,code)=>crypto.createHash('sha256').update(salt+':'+code).digest('hex');
const emailOk=e=>/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e)&&e.length<=254;
function cleanAuthTables(){const t=Date.now();db.emailCodes=db.emailCodes.filter(c=>c.expires>t);db.signupTokens=db.signupTokens.filter(c=>c.expires>t)}
async function sendCodeEmail(email,code){
  if(process.env.NODE_ENV!=='production')console.log(`Xyron email code for ${email}: ${code}`);
  if(process.env.EMAIL_TRANSPORT==='console')return;
  const subject='Your Xyron verification code';
  const text=`Your Xyron verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`;
  const html=`<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px"><h2 style="margin:0 0 12px">Your Xyron code</h2><p style="color:#444">Enter this code to continue:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#777;font-size:13px">It expires in 10 minutes. If you did not request it, ignore this email.</p></div>`;
  // 0a) Brevo (HTTPS API, works on hosts that block SMTP). Set BREVO_API_KEY and BREVO_FROM_EMAIL (a sender verified in Brevo).
  const brevoKey=String(process.env.BREVO_API_KEY||'').trim();
  if(brevoKey){
    const senderEmail=String(process.env.BREVO_FROM_EMAIL||'').trim();
    if(!senderEmail)throw Error('Brevo: set BREVO_FROM_EMAIL to a sender verified in your Brevo account');
    const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',
      headers:{'api-key':brevoKey,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({sender:{name:String(process.env.BREVO_FROM_NAME||'Xyron').trim(),email:senderEmail},to:[{email}],subject,textContent:text,htmlContent:html}),
      signal:AbortSignal.timeout(15000)});
    if(!r.ok){const t=await r.text().catch(()=> '');throw Error(`Brevo error (${r.status}): ${t.slice(0,200)}`)}
    return;
  }
  // 0b) Resend (HTTPS API, works on Render free tier). Set RESEND_API_KEY (and RESEND_FROM once your domain is verified).
  const resendKey=String(process.env.RESEND_API_KEY||'').trim();
  if(resendKey){
    const from=String(process.env.RESEND_FROM||'Xyron <onboarding@resend.dev>').trim();
    const r=await fetch('https://api.resend.com/emails',{method:'POST',
      headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({from,to:[email],subject,text,html}),signal:AbortSignal.timeout(15000)});
    if(!r.ok){const t=await r.text().catch(()=> '');throw Error(`Resend error (${r.status}): ${t.slice(0,200)}`)}
    return;
  }
  // 1) SMTP (Gmail etc.) when SMTP_USER + SMTP_PASS are set in .env. See smtp.mjs.
  if(smtpConfigured()){
    try{
      await sendSmtp({to:email,subject,
        text:`Your Xyron verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
        html:`<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px"><h2 style="margin:0 0 12px">Your Xyron code</h2><p style="color:#444">Enter this code to continue:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#777;font-size:13px">It expires in 10 minutes. If you did not request it, ignore this email.</p></div>`});
      return;
    }catch(e){
      // Render FREE services block SMTP ports, so fall back to Formspree instead of failing the sign-up.
      console.error('SMTP send failed, falling back to Formspree:',e.message);
    }
  }
  // 2) Formspree (HTTP, no SMTP)
  const r=await fetch(FORMSPREE_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({email,_subject:subject,subject,code,message:`Your Xyron verification code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`})});
  if(!r.ok){const t=await r.text().catch(()=> '');throw Error(`Email provider error (${r.status}): ${t.slice(0,160)}`)}
}
function startSession(res,u){const sid=id();db.sessions.push({id:sid,userId:u.id,created_date:now()});cookie(res,'xyron_session',sid)}
// ---------- Phone sign-up / sign-in (phone number + password) ----------
// The phone number is stored as +<country code><digits>. Passwords are salted scrypt hashes like everywhere else.
// Failed logins are rate-limited per phone number and per visitor so passwords cannot be guessed quickly.
const clientIp=req=>String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim()||'?';
function normPhone(cc,national){
  const c=String(cc||'').replace(/\D/g,''),n=String(national||'').replace(/\D/g,'');
  if(!/^\d{1,3}$/.test(c))return null;
  // people often type the leading 0 of a local number (080...): drop it
  const nn=n.replace(/^0+/,'');
  const all=c+nn;
  return nn.length>=5&&all.length>=8&&all.length<=15?'+'+all:null;
}
const phoneHits=new Map();
function phoneTooMany(key,max,windowMs){const t=Date.now();const a=(phoneHits.get(key)||[]).filter(x=>t-x<windowMs);phoneHits.set(key,a);return a.length>=max}
function phoneAddHit(key){const a=phoneHits.get(key)||[];a.push(Date.now());phoneHits.set(key,a)}
function parseBirth(d){
  const y=Number(d.birthYear),m=Number(d.birthMonth),day=Number(d.birthDay);
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(day))return {error:'Choose your month, day and year of birth.'};
  const dt=new Date(Date.UTC(y,m-1,day));
  if(y<1900||m<1||m>12||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==day)return {error:'That date of birth is not valid.'};
  const t=new Date();let age=t.getUTCFullYear()-y;if(t.getUTCMonth()+1<m||(t.getUTCMonth()+1===m&&t.getUTCDate()<day))age--;
  if(age<0)return {error:'That date of birth is in the future.'};
  if(age<13)return {error:'You must be at least 13 years old to create an account.'};
  return {value:`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
}
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
async function saveGeneratedAudio(me,mime,bytes,title){
  const clean=['audio/mpeg','audio/mp3','audio/wav','audio/x-wav'].includes(mime)?(mime==='audio/mp3'?'audio/mpeg':mime):'audio/mpeg';
  const ext=mimeExt(clean),fileId=id(),dir=path.join(DATA,'uploads',me.id),fp=path.join(dir,fileId+ext);
  if(usingPg)await storeFilePut(fileId,bytes);else{await mkdir(dir,{recursive:true});await writeFile(fp,bytes)}
  const safe=String(title||'song').replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,40)||'song';
  db.files.unshift({id:fileId,userId:me.id,name:`${safe}${ext}`,mime:clean,size:bytes.length,path:fp,created_date:now(),generated:true,kind:'music'});
  await save();
  return fileId;
}
// Lets the seek bar work for generated songs (browsers ask for byte ranges).
async function serveAudioRange(req,res,f){
  const m=/^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range||''));
  if(!m||(m[1]===''&&m[2]===''))return false;
  let buf=null,total;
  if(usingPg){buf=await storeFileGet(f.id);if(!buf)return false;total=buf.length}else total=(await stat(f.path)).size;
  const s0=m[1]===''?Math.max(0,total-Number(m[2])):Number(m[1]);
  const e0=m[1]===''||m[2]===''?total-1:Math.min(Number(m[2]),total-1);
  if(s0>e0||s0>=total){res.writeHead(416,{'Content-Range':`bytes */${total}`});res.end();return true}
  res.writeHead(206,{'Content-Type':f.mime,'Accept-Ranges':'bytes','Content-Range':`bytes ${s0}-${e0}/${total}`,'Content-Length':e0-s0+1,'Content-Disposition':'inline'});
  if(buf)res.end(buf.subarray(s0,e0+1));else await pipeline((await import('node:fs')).createReadStream(f.path,{start:s0,end:e0}),res);
  return true;
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
// ---------- Hosting + Render connection ----------
if(!Array.isArray(db.hosted))db.hosted=[];
if(!db.renderKeys||typeof db.renderKeys!=='object'||Array.isArray(db.renderKeys))db.renderKeys={};
const HOST_EXT={html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',txt:'text/plain; charset=utf-8',md:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8'};
const hostMime=f=>HOST_EXT[String(f).split('.').pop().toLowerCase()]||'text/plain; charset=utf-8';
const HOST_MAX_FILES=60, HOST_MAX_BYTES=2*1024*1024;
function hostClean(files){
  if(!Array.isArray(files)||!files.length)throw new Error('Add at least one file to publish.');
  if(files.length>HOST_MAX_FILES)throw new Error(`Too many files (max ${HOST_MAX_FILES}).`);
  let total=0;const seen=new Set(),out=[];
  for(const f of files){
    const pth=String(f?.path||'').replace(/\\/g,'/').replace(/^\/+/,'');
    if(!pth||pth.length>200||pth.split('/').some(x=>!x||x==='.'||x==='..'))throw new Error(`Bad file name: ${pth.slice(0,60)||'(empty)'}`);
    if(!HOST_EXT[pth.split('.').pop().toLowerCase()])throw new Error(`Only web text files can be hosted (html, css, js, json, svg, txt, md): ${pth}`);
    if(seen.has(pth))continue;seen.add(pth);
    const content=String(f?.content??'');total+=Buffer.byteLength(content);
    if(total>HOST_MAX_BYTES)throw new Error('Files are too big to host (2 MB max in total).');
    out.push({path:pth,content});
  }
  if(!out.some(x=>/(^|\/)index\.html?$/i.test(x.path))){const h=out.find(x=>/\.html?$/i.test(x.path));if(h)out.push({path:'index.html',content:h.content})}
  return out;
}
function hostKey(){const s=process.env.RENDER_KEY_SECRET||(db.hostSecret||(db.hostSecret=crypto.randomBytes(32).toString('hex'),save().catch(()=>{}),db.hostSecret));return crypto.createHash('sha256').update(s).digest()}
function sealKey(t){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',hostKey(),iv),enc=Buffer.concat([c.update(t,'utf8'),c.final()]);return [iv,c.getAuthTag(),enc].map(b=>b.toString('base64')).join('.')}
function openKey(v){try{const [iv,tag,enc]=String(v).split('.').map(x=>Buffer.from(x,'base64')),d=crypto.createDecipheriv('aes-256-gcm',hostKey(),iv);d.setAuthTag(tag);return Buffer.concat([d.update(enc),d.final()]).toString('utf8')}catch{return ''}}
async function renderApi(me,method,pth,payload){
  const rec=db.renderKeys[me.id],key=rec&&openKey(rec.key);
  if(!key){const e=new Error('Render is not connected.');e.status=409;throw e}
  const r=await fetch('https://api.render.com/v1'+pth,{method,headers:{Authorization:`Bearer ${key}`,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(25000)});
  const text=await r.text();let j=null;try{j=text?JSON.parse(text):null}catch{}
  if(!r.ok){const e=new Error(r.status===401?'Render rejected the API key. Reconnect with a new key.':(j?.message||`Render error (${r.status})`));e.status=r.status===401?401:502;throw e}
  return j;
}

// ---------- Host a GitHub repository on Render (used by the chat's hosting card) ----------
// Public repositories are read through GitHub's API to guess what the project is (static site or web service).
// Set GITHUB_TOKEN to raise GitHub's anonymous rate limit (60 requests/hour per server IP).
const GH_REPO_RE=/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/?#]+)(?:\/[^?#]*)?)?\/?(?:[?#].*)?$/i;
function parseGithubRepo(url){const m=GH_REPO_RE.exec(String(url||'').trim());if(!m)return null;return{owner:m[1],repo:m[2],branch:m[3]||'',url:`https://github.com/${m[1]}/${m[2]}`}}
async function ghGet(pth){
  const r=await fetch('https://api.github.com'+pth,{headers:{'User-Agent':'XyronHost/1.0',Accept:'application/vnd.github+json',...(process.env.GITHUB_TOKEN?{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`}:{})},signal:AbortSignal.timeout(15000)});
  if(r.status===404)return{missing:true};
  if(r.status===403||r.status===429)throw Object.assign(new Error('GitHub is busy right now. Try again in a minute.'),{status:429});
  if(!r.ok)throw Object.assign(new Error(`GitHub error (${r.status}).`),{status:502});
  return{data:await r.json()};
}
const analyzeCache=new Map(); // "owner/repo@branch" -> {at, out}
async function analyzeGithubRepo(gh){
  const key=`${gh.owner}/${gh.repo}@${gh.branch}`.toLowerCase(),hit=analyzeCache.get(key);
  if(hit&&Date.now()-hit.at<300000)return hit.out;
  const info=await ghGet(`/repos/${gh.owner}/${gh.repo}`);
  const base={owner:gh.owner,repo:gh.repo,url:gh.url,name:gh.repo.replace(/[^A-Za-z0-9-_]/g,'-').slice(0,50)};
  if(info.missing){
    // Private (or mistyped) repository: GitHub hides it from us. Render may still be able to read it
    // if their Render account is linked to GitHub, so we let them continue with manual settings.
    return{...base,found:false,branch:gh.branch||'main',kind:'web',runtime:'node',buildCommand:'npm install',startCommand:'npm start',publishPath:'.',
      reason:'I could not see this repository. If it is private, Render must be linked to your GitHub (Render dashboard, Account settings). Check the settings below, then host it.'};
  }
  const branch=gh.branch||info.data.default_branch||'main';
  const root=await ghGet(`/repos/${gh.owner}/${gh.repo}/contents?ref=${encodeURIComponent(branch)}`);
  const names=Array.isArray(root.data)?root.data.map(x=>x.name):[];
  const has=n=>names.includes(n);
  let pkg=null;
  if(has('package.json')){
    const f=await ghGet(`/repos/${gh.owner}/${gh.repo}/contents/package.json?ref=${encodeURIComponent(branch)}`);
    try{pkg=JSON.parse(Buffer.from(f.data?.content||'','base64').toString('utf8'))}catch{pkg=null}
  }
  const out={...base,found:true,branch,private:!!info.data.private,description:String(info.data.description||'').slice(0,160),publishPath:'.'};
  const deps={...(pkg?.dependencies||{}),...(pkg?.devDependencies||{})};
  const scripts=pkg?.scripts||{};
  const serverDeps=['express','fastify','koa','hono','next','@nestjs/core','socket.io','ws','telegraf','discord.js','grammy','node-telegram-bot-api','@hapi/hapi','nuxt'];
  const isServer=serverDeps.some(d=>deps[d])||has('server.js')||has('server.mjs')||has('app.js');
  const spaTool=deps.vite?'dist':deps['react-scripts']?'build':null;
  if(pkg&&scripts.start&&(isServer||!spaTool)){
    out.kind='web';out.runtime='node';
    out.buildCommand=scripts.build?'npm install && npm run build':'npm install';
    out.startCommand='npm start';
    out.reason=`Node app with a start script${scripts.build?' and a build step':''}. It will run as a web service.`;
  }else if(pkg&&scripts.build&&spaTool){
    out.kind='static';out.buildCommand='npm install && npm run build';out.publishPath=spaTool;
    out.reason=`${deps.vite?'Vite':'Create React App'} front-end. It will be built and hosted as a static site (free).`;
  }else if(pkg&&(pkg.main||has('index.js'))){
    out.kind='web';out.runtime='node';out.buildCommand='npm install';out.startCommand=`node ${String(pkg.main||'index.js').replace(/[^\w./-]/g,'')}`;
    out.reason='Node app. It will run as a web service.';
  }else if(has('Dockerfile')){
    out.kind='web';out.runtime='docker';out.buildCommand='';out.startCommand='';out.reason='Found a Dockerfile. Render will build it as a web service.';
  }else if(has('requirements.txt')){
    out.kind='web';out.runtime='python';out.buildCommand='pip install -r requirements.txt';
    const f=await ghGet(`/repos/${gh.owner}/${gh.repo}/contents/requirements.txt?ref=${encodeURIComponent(branch)}`).catch(()=>({}));
    const req=Buffer.from(f.data?.content||'','base64').toString('utf8').toLowerCase();
    out.startCommand=req.includes('fastapi')?'uvicorn main:app --host 0.0.0.0 --port $PORT':req.includes('flask')?'gunicorn app:app':'python main.py';
    out.reason='Python app. Check the start command below matches your main file.';
  }else if(has('index.html')){
    out.kind='static';out.buildCommand='';out.publishPath='.';out.reason='Plain website (index.html). It will be hosted as a static site (free).';
  }else{
    out.kind='static';out.buildCommand='';out.publishPath='.';
    out.reason='I could not tell what kind of project this is. Check the settings below before hosting.';
  }
  analyzeCache.set(key,{at:Date.now(),out});if(analyzeCache.size>100)analyzeCache.delete(analyzeCache.keys().next().value);
  return out;
}
const RENDER_PLANS=new Set(['free','starter','standard']);
function renderPhase(status){
  const s=String(status||'');
  if(s==='live')return'live';
  if(/failed|canceled|deactivated/.test(s))return'failed';
  return'building';
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
 // ---------- Hosted pages: /p/<id>/<file> (public links made from Codex) ----------
 if((method==='GET'||method==='HEAD')&&p.startsWith('/p/')){
   const parts=p.slice(3).split('/').map(x=>{try{return decodeURIComponent(x)}catch{return ''}}),site=db.hosted.find(x=>x.id===parts[0]);
   if(!site)return send(res,404,{message:'This page does not exist.'});
   if(parts.length===1)return res.writeHead(302,{Location:`/p/${site.id}/`}).end();
   const rel=parts.slice(1).join('/')||'index.html',f=site.files.find(x=>x.path===rel)||(rel.endsWith('/')?site.files.find(x=>x.path===rel+'index.html'):null)||site.files.find(x=>x.path===rel.replace(/\/$/,'')+'/index.html');
   if(!f)return send(res,404,{message:'File not found.'});
   // Sandboxed (no allow-same-origin): the page runs, but cannot read Xyron's cookies or call Xyron's API as the visitor.
   res.writeHead(200,{'Content-Type':hostMime(f.path),'Cache-Control':'public, max-age=30','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox allow-scripts allow-forms allow-popups allow-modals','Referrer-Policy':'no-referrer'});
   return res.end(method==='HEAD'?undefined:f.content);
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
 if(p==='/api/auth/phone-exists'&&method==='POST'){
   const ip=clientIp(req);
   if(phoneTooMany('pe:'+ip,40,10*60*1000))return send(res,429,{message:'Too many tries. Please wait a few minutes.'});
   phoneAddHit('pe:'+ip);
   const phone=normPhone(data.countryCode,data.phone);
   if(!phone)return send(res,400,{message:'Enter a valid phone number.'});
   return send(res,200,{exists:db.users.some(x=>x.phone===phone)});
 }
 if(p==='/api/auth/phone-signup'&&method==='POST'){
   const ip=clientIp(req);
   if(phoneTooMany('ps:'+ip,10,60*60*1000))return send(res,429,{message:'Too many sign-ups from this device. Try again later.'});
   const fail=(message,field)=>send(res,400,{message,field});
   const phone=normPhone(data.countryCode,data.phone);
   if(!phone)return fail('Enter a valid phone number.','phone');
   const pw=String(data.password||''),cpw=String(data.confirmPassword||'');
   if(pw.length<8)return fail('Password must be at least 8 characters.','password');
   if(pw.length>128)return fail('Password is too long (max 128 characters).','password');
   if(pw!==cpw)return fail('Passwords do not match.','confirmPassword');
   const first=String(data.firstName||'').replace(/\s+/g,' ').trim(),last=String(data.lastName||'').replace(/\s+/g,' ').trim();
   if(first.length<1||first.length>30)return fail('Enter your first name.','firstName');
   if(last.length<1||last.length>30)return fail('Enter your last name.','lastName');
   const b=parseBirth(data);if(b.error)return fail(b.error,'birth');
   if(data.acceptedTerms!==true)return fail('You must accept the Terms and Conditions.','terms');
   if(db.users.some(x=>x.phone===phone))return send(res,409,{message:'An account with this phone number already exists. Log in instead.',field:'phone'});
   phoneAddHit('ps:'+ip);
   const h=hash(pw);
   const nu={id:id(),phone,phoneVerified:false,first_name:first,last_name:last,full_name:`${first} ${last}`.slice(0,40),birthdate:b.value,role:'user',passwordHash:h.hash,passwordSalt:h.salt,termsAcceptedAt:now(),created_date:now()};
   db.users.push(nu);startSession(res,nu);await save();
   return send(res,201,{user:safeUser(nu)});
 }
 if(p==='/api/auth/phone-login'&&method==='POST'){
   const phone=normPhone(data.countryCode,data.phone),ip=clientIp(req);
   if(!phone)return send(res,400,{message:'Enter a valid phone number.'});
   const k1='pl:'+phone,k2='pl:'+ip;
   if(phoneTooMany(k1,8,15*60*1000)||phoneTooMany(k2,30,15*60*1000))return send(res,429,{message:'Too many wrong attempts. Try again in a few minutes.'});
   const u=db.users.find(x=>x.phone===phone);
   if(!u||!u.passwordHash||!valid(String(data.password||''),u.passwordSalt,u.passwordHash)){phoneAddHit(k1);phoneAddHit(k2);return send(res,401,{message:'Incorrect phone number or password.'})}
   if(u.banned)return send(res,403,{message:'Account is suspended.'});
   phoneHits.delete(k1);startSession(res,u);await save();
   return send(res,200,{user:safeUser(u)});
 }
 if(p==='/api/auth/google'&&method==='GET'){
   const cid=process.env.GOOGLE_CLIENT_ID;
   if(!cid||!process.env.GOOGLE_CLIENT_SECRET)return oauthFail(res,'Google sign-in is not set up yet.');
   const now_=Date.now();for(const [k,v] of oauthStates)if(v.exp<now_)oauthStates.delete(k);
   const state=crypto.randomBytes(20).toString('hex');oauthStates.set(state,{returnTo:safePath(u.searchParams.get('returnTo')),exp:now_+10*60*1000});
   const q=new URLSearchParams({client_id:cid,redirect_uri:publicBase(req)+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,prompt:'select_account'});
   console.log('[google] sign-in redirect_uri =',q.get('redirect_uri'),'(must match Google Console exactly)');
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
   try{if(/^audio\//.test(f.mime)&&req.headers.range&&await serveAudioRange(req,res,f))return;if(usingPg){const buf=await storeFileGet(f.id);if(!buf)return send(res,404,{message:'File unavailable'});res.writeHead(200,{'Content-Type':f.mime,'Content-Length':buf.length,'Content-Disposition':`inline; filename="${f.name}"`,...(/^audio\//.test(f.mime)?{'Accept-Ranges':'bytes'}:{})});return res.end(buf)}const st=await stat(f.path);res.writeHead(200,{'Content-Type':f.mime,'Content-Length':st.size,'Content-Disposition':`inline; filename="${f.name}"`,...(/^audio\//.test(f.mime)?{'Accept-Ranges':'bytes'}:{})});return pipeline((await import('node:fs')).createReadStream(f.path),res)}catch{return send(res,404,{message:'File unavailable'})}
 }
 if(p==='/api/push/key'&&method==='GET')return send(res,200,{publicKey:vapidKeys().publicKey});
 if(p==='/api/push/subscribe'&&method==='POST'){
   const sub=data.subscription||{};const endpoint=String(sub.endpoint||'');const k=sub.keys||{};
   if(!isAllowedEndpoint(endpoint)||endpoint.length>1000||typeof k.p256dh!=='string'||typeof k.auth!=='string'||k.p256dh.length>200||k.auth.length>100)return send(res,400,{message:'Invalid push subscription'});
   if(/^https:\/\//.test(originOf(req)))vapidSubjectGuess=originOf(req);
   const entry={id:id(),userId:me.id,endpoint,keys:{p256dh:k.p256dh,auth:k.auth},ua:String(req.headers['user-agent']||'').slice(0,160),created_date:now()};
   const i=db.pushSubs.findIndex(x=>x.endpoint===endpoint);
   if(i>=0)db.pushSubs[i]={...db.pushSubs[i],...entry,id:db.pushSubs[i].id,created_date:db.pushSubs[i].created_date};else db.pushSubs.push(entry);
   const mine=db.pushSubs.filter(x=>x.userId===me.id);
   if(mine.length>10){const drop=new Set(mine.slice(0,mine.length-10).map(x=>x.endpoint));db.pushSubs=db.pushSubs.filter(x=>!drop.has(x.endpoint))}
   await save();return send(res,200,{ok:true});
 }
 if(p==='/api/push/unsubscribe'&&method==='POST'){
   const endpoint=String(data.endpoint||'');db.pushSubs=db.pushSubs.filter(x=>!(x.endpoint===endpoint&&x.userId===me.id));await save();return send(res,200,{ok:true});
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
   return send(res,200,{broadcasts:db.broadcasts.slice().sort((a,b)=>b.created_date.localeCompare(a.created_date)).slice(0,50).map(b=>({...b,seenBy:db.broadcastAcks.filter(a=>a.broadcastId===b.id).length})),totalUsers:db.users.length,devices:db.pushSubs.length});
 }
 if(p==='/api/broadcasts'&&method==='POST'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const message=String(data.message||'').trim().slice(0,500),title=String(data.title||'').trim().slice(0,80)||'Xyron';
   if(!message)return send(res,400,{message:'Write a message to broadcast.'});
   const b={id:id(),title,message,url:cleanUrl(data.url),created_by:me.id,created_date:now()};
   db.broadcasts.unshift(b);await save();const devices=db.pushSubs.length;pushBroadcast(b);return send(res,201,{broadcast:b,devices});
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
   const q=String(u.searchParams.get('q')||'wallpaper').replace(/\s+/g,' ').trim().slice(0,60)||'wallpaper';
   try{return send(res,200,{q,images:await animeFeed(q.toLowerCase())})}
   catch(e){console.error('anime feed failed:',e.message);return send(res,502,{message:'The image feed is unavailable right now. Please try again in a moment.'})}
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

 // ---------- Host files (Xyron link) + Render ----------
 if(p.startsWith('/api/host')||p.startsWith('/api/render')){
   if(!me)return send(res,401,{message:'Sign in first.'});
   const mine=db.hosted.filter(x=>x.userId===me.id);
   if(p==='/api/host'&&method==='GET')return send(res,200,{sites:mine.map(x=>({id:x.id,name:x.name,url:`${originOf(req)}/p/${x.id}/`,files:x.files.length,updatedAt:x.updatedAt})).reverse()});
   if(p==='/api/host/publish'&&method==='POST'){
     let files;try{files=hostClean(data.files)}catch(e){return send(res,400,{message:e.message})}
     const name=String(data.name||'My site').replace(/\s+/g,' ').trim().slice(0,60)||'My site';
     let site=data.siteId&&mine.find(x=>x.id===String(data.siteId));
     if(!site){if(mine.length>=25)return send(res,400,{message:'You have 25 hosted sites. Delete one first.'});site={id:crypto.randomBytes(6).toString('hex'),userId:me.id,name,files:[],createdAt:now()};db.hosted.push(site)}
     site.name=name;site.files=files;site.updatedAt=now();await save();
     return send(res,200,{id:site.id,url:`${originOf(req)}/p/${site.id}/`});
   }
   if(p==='/api/host/delete'&&method==='POST'){db.hosted=db.hosted.filter(x=>!(x.userId===me.id&&x.id===String(data.id||'')));await save();return send(res,200,{ok:true})}
   if(p==='/api/render/status'&&method==='GET'){const r=db.renderKeys[me.id];return send(res,200,{connected:!!r,ownerName:r?.ownerName||'',connectedAt:r?.at||null})}
   if(p==='/api/render/connect'&&method==='POST'){
     const key=String(data.apiKey||'').trim();
     if(!/^rnd_[A-Za-z0-9]{16,80}$/.test(key))return send(res,400,{message:'That does not look like a Render API key. It starts with rnd_.'});
     try{
       const r=await fetch('https://api.render.com/v1/owners?limit=20',{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
       if(r.status===401||r.status===403)return send(res,401,{message:'Render did not accept that key.'});
       if(!r.ok)return send(res,502,{message:`Render error (${r.status}). Try again.`});
       const owners=(await r.json()||[]).map(x=>x.owner).filter(Boolean),o=owners[0];
       if(!o)return send(res,400,{message:'No Render workspace found for that key.'});
       db.renderKeys[me.id]={key:sealKey(key),ownerId:o.id,ownerName:o.name||o.email||'Render',at:now()};await save();
       return send(res,200,{connected:true,ownerName:db.renderKeys[me.id].ownerName});
     }catch(e){console.error('render connect failed:',e.message);return send(res,502,{message:'Could not reach Render. Try again.'})}
   }
   if(p==='/api/render/disconnect'&&method==='POST'){delete db.renderKeys[me.id];await save();return send(res,200,{connected:false})}
   if(p==='/api/render/services'&&method==='GET'){
     try{const j=await renderApi(me,'GET','/services?limit=30');return send(res,200,{services:(j||[]).map(x=>x.service).filter(Boolean).map(x=>({id:x.id,name:x.name,type:x.type,url:x.serviceDetails?.url||'',dashboardUrl:x.dashboardUrl||'',suspended:x.suspended&&x.suspended!=='not_suspended',repo:x.repo||''}))})}
     catch(e){return send(res,e.status||502,{message:e.message})}
   }
   if(p==='/api/render/deploy'&&method==='POST'){
     const sid=String(data.serviceId||'');if(!/^srv-[a-z0-9]+$/.test(sid))return send(res,400,{message:'Pick a service to deploy.'});
     try{const j=await renderApi(me,'POST',`/services/${sid}/deploys`,{clearCache:'do_not_clear'});return send(res,200,{deployId:j?.id||'',status:j?.status||'created'})}
     catch(e){return send(res,e.status||502,{message:e.message})}
   }
   // Render can only build from a Git repository, so a new site needs the repo that holds the files.
   if(p==='/api/render/create-site'&&method==='POST'){
     const repo=String(data.repo||'').trim(),branch=String(data.branch||'main').trim()||'main',name=String(data.name||'').trim().replace(/[^A-Za-z0-9-_ ]/g,'').slice(0,50);
     if(!/^https:\/\/(github|gitlab)\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/i.test(repo))return send(res,400,{message:'Enter the repository address, like https://github.com/you/my-site'});
     if(!name)return send(res,400,{message:'Give the site a name.'});
     if(!/^[\w./-]{1,80}$/.test(branch))return send(res,400,{message:'That branch name is not valid.'});
     try{const j=await renderApi(me,'POST','/services',{type:'static_site',name,ownerId:db.renderKeys[me.id].ownerId,repo,branch,autoDeploy:'yes',serviceDetails:{publishPath:String(data.publishPath||'.').slice(0,80),buildCommand:String(data.buildCommand||'').slice(0,200)}});
       const sv=j?.service||j||{};return send(res,200,{id:sv.id||'',url:sv.serviceDetails?.url||'',dashboardUrl:sv.dashboardUrl||''})}
     catch(e){return send(res,e.status||502,{message:e.message})}
   }
   // ---- Chat hosting card: paste a GitHub link, connect Render once, host, then keep hosting more ----
   if(p==='/api/render/analyze'&&method==='GET'){
     const gh=parseGithubRepo(u.searchParams.get('repo'));
     if(!gh)return send(res,400,{message:'Paste a GitHub repository link, like https://github.com/you/my-app'});
     try{
       const out=await analyzeGithubRepo(gh);
       let existing=null;
       if(db.renderKeys[me.id]){
         try{
           const j=await renderApi(me,'GET','/services?limit=100');
           const svc=(j||[]).map(x=>x.service).filter(Boolean).find(x=>String(x.repo||'').toLowerCase().replace(/\.git$/,'')===out.url.toLowerCase());
           if(svc)existing={id:svc.id,name:svc.name,url:svc.serviceDetails?.url||'',dashboardUrl:svc.dashboardUrl||''};
         }catch(e){if(e.status===401)return send(res,401,{message:e.message})}
       }
       return send(res,200,{...out,existing});
     }catch(e){return send(res,e.status||502,{message:e.message})}
   }
   if(p==='/api/render/host-repo'&&method==='POST'){
     if(!db.renderKeys[me.id])return send(res,409,{message:'Connect your Render account first.'});
     const gh=parseGithubRepo(data.repo);
     if(!gh)return send(res,400,{message:'Paste a GitHub repository link, like https://github.com/you/my-app'});
     const name=String(data.name||gh.repo).trim().replace(/[^A-Za-z0-9-_ ]/g,'').slice(0,50);
     const branch=String(data.branch||'main').trim()||'main';
     if(!name)return send(res,400,{message:'Give the project a name.'});
     if(!/^[\w./-]{1,80}$/.test(branch))return send(res,400,{message:'That branch name is not valid.'});
     const kind=data.kind==='static'?'static':'web';
     const envVars=(Array.isArray(data.envVars)?data.envVars:[]).slice(0,30)
       .map(e=>({key:String(e?.key||'').trim(),value:String(e?.value??'').slice(0,2000)}))
       .filter(e=>/^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(e.key));
     const body={name,ownerId:db.renderKeys[me.id].ownerId,repo:gh.url,branch,autoDeploy:'yes',...(envVars.length?{envVars}:{})};
     if(kind==='static'){
       body.type='static_site';
       body.serviceDetails={publishPath:String(data.publishPath||'.').slice(0,80),buildCommand:String(data.buildCommand||'').slice(0,300)};
     }else{
       const runtime=['node','python','docker','go','ruby','rust','elixir'].includes(data.runtime)?data.runtime:'node';
       const plan=RENDER_PLANS.has(data.plan)?data.plan:(process.env.RENDER_DEFAULT_PLAN||'free');
       body.type='web_service';
       body.serviceDetails={runtime,plan,envSpecificDetails:runtime==='docker'
         ?{dockerfilePath:'./Dockerfile',dockerContext:'.'}
         :{buildCommand:String(data.buildCommand||'').slice(0,300),startCommand:String(data.startCommand||'').slice(0,300)}};
       if(runtime!=='docker'&&(!body.serviceDetails.envSpecificDetails.buildCommand||!body.serviceDetails.envSpecificDetails.startCommand))
         return send(res,400,{message:'A web service needs a build command and a start command.'});
     }
     try{
       const j=await renderApi(me,'POST','/services',body);
       const sv=j?.service||j||{};
       return send(res,200,{id:sv.id||'',name:sv.name||name,kind,url:sv.serviceDetails?.url||'',dashboardUrl:sv.dashboardUrl||'',deployId:j?.deployId||''});
     }catch(e){
       console.error('render host-repo failed:',e.message);
       const hint=/plan/i.test(e.message)&&body.serviceDetails?.plan==='free'?' Try the Starter plan instead.':'';
       return send(res,e.status||502,{message:e.message+hint});
     }
   }
   if(p==='/api/render/service-status'&&method==='GET'){
     const sid=String(u.searchParams.get('serviceId')||'');if(!/^(srv|crn)-[a-z0-9]+$/.test(sid))return send(res,400,{message:'Bad service id.'});
     try{
       const [d,sv]=await Promise.all([renderApi(me,'GET',`/services/${sid}/deploys?limit=1`),renderApi(me,'GET',`/services/${sid}`)]);
       const dep=(Array.isArray(d)?d[0]?.deploy||d[0]:null)||null,status=dep?.status||'created';
       return send(res,200,{status,phase:renderPhase(status),url:sv?.serviceDetails?.url||'',dashboardUrl:sv?.dashboardUrl||''});
     }catch(e){return send(res,e.status||502,{message:e.message})}
   }
   return send(res,404,{message:'Not found'});
 }

 // ---------- Music (search + streaming only; nothing can be downloaded) ----------
 if(p.startsWith('/api/music/')&&!me)return send(res,401,{message:'Sign in to use Music.'});
 const musicOut=t=>t.source==='youtube'?{id:t.id,title:t.title,artist:t.artist,album:t.album,cover:t.cover,duration:t.duration,source:'youtube',full:true,videoId:t.videoId}:({id:t.id,title:t.title,artist:t.artist,album:t.album,cover:t.cover,duration:t.duration,source:t.source,full:t.full,src:`/api/music/stream?u=${encodeURIComponent(t.upstream)}&s=${animeSign(t.upstream)}`});
 if(p==='/api/music/config'&&method==='GET')return send(res,200,{create:lyriaConfigured()});
 if(p==='/api/music/search'&&method==='GET'){
   const q=String(u.searchParams.get('q')||'').replace(/\s+/g,' ').trim().slice(0,80);
   if(q.length<1)return send(res,400,{message:'Type a song or artist.'});
   const rk=`m:${me.id}:${Math.floor(Date.now()/60000)}`;
   imageSearchHits.set(rk,(imageSearchHits.get(rk)||0)+1);
   if(imageSearchHits.get(rk)>40&&!admin(me))return send(res,429,{message:'Too many searches. Try again in a minute.'});
   try{return send(res,200,{q,tracks:(await musicSearch(q)).map(musicOut)})}
   catch(e){console.error('music search failed:',e.message);return send(res,502,{message:'Music search is unavailable right now. Please try again.'})}
 }
 if(p==='/api/music/trending'&&method==='GET'){
   try{return send(res,200,{tracks:(await musicTrending()).map(musicOut)})}
   catch(e){console.error('music trending failed:',e.message);return send(res,502,{message:'Music is unavailable right now. Please try again.'})}
 }
 if(p==='/api/music/track'&&method==='GET'){
   try{const t=await musicTrack(u.searchParams.get('id'));if(!t)return send(res,404,{message:'Song not found.'});return send(res,200,{track:musicOut(t)})}
   catch(e){return send(res,502,{message:'Could not load that song.'})}
 }
 if(p==='/api/music/stream'&&(method==='GET'||method==='HEAD')){
   const src=String(u.searchParams.get('u')||'');
   if(!animeSigOk(src,u.searchParams.get('s'))||!animeHostOk(src))return send(res,403,{message:'Bad audio link'});
   try{return await streamUpstream(src,req,res)}
   catch(e){if(!res.headersSent)return send(res,502,{message:'Song unavailable'});res.end();return}
 }
 if(p==='/api/music/generate'&&method==='POST'){
   if(!lyriaConfigured())return send(res,503,{message:'Song creation is not set up yet.'});
   const prompt=String(data.prompt||'').replace(/\s+/g,' ').trim().slice(0,600);
   if(prompt.length<5)return send(res,400,{message:'Describe the song you want in a few words.'});
   const full=data.full===true;
   const kind=full?'musicfull':'musicclip';
   if(!await bumpUsage(me,kind,full?2:5))return send(res,429,{message:full?'You have used your full songs for today. Try a 30-second clip or come back tomorrow.':'You have used your song clips for today. Come back tomorrow or upgrade for more.'});
   try{
     const out=await generateSong(prompt,full);
     const words=prompt.replace(/[^\p{L}\p{N} ]/gu,'').split(' ').filter(Boolean).slice(0,5).join(' ');
     const title=(words||'New song').replace(/^./u,c=>c.toUpperCase());
     const fileId=await saveGeneratedAudio(me,out.mime,out.bytes,title);
     return send(res,200,{track:{id:`ly_${fileId}`,title,artist:'Xyron AI',album:'Lyria',cover:'',duration:full?0:30,source:'lyria',full:true,src:`/api/files/${fileId}`,lyrics:out.lyrics.slice(0,4000)}});
   }catch(e){
     console.error('lyria generation failed:',e.message);
     const x=db.usage.find(v=>v.key===usageKey(me,kind));if(x&&x.count>0){x.count--;await save()} // a failed song does not use up a try
     return send(res,502,{message:'Could not create that song right now. Try different words or try again.'});
   }
 }
 if(p==='/api/usage'&&method==='GET')return send(res,200,{usage:db.usage.filter(x=>x.userId===me.id)});

 if(p.startsWith('/api/entities/')){const type=p.split('/')[3];const map={Conversation:'conversations',Message:'messages',CodeFile:'codeFiles',Subscription:'subscriptions',User:'users',Feedback:'feedback'};const key=map[type];if(!key)return send(res,404,{message:'Unknown entity'});if(type==='CodeFile'){if(method==='POST'){if(String(data.content||'').length>1048576)return send(res,413,{message:'File is too large (1 MB max).'});if(db.codeFiles.filter(x=>x.userId===me.id).length>=300)return send(res,429,{message:'File limit reached (300). Delete some files first.'})}if(method==='PATCH'&&String(data.content||'').length>1048576)return send(res,413,{message:'File is too large (1 MB max).'})}if(type==='Subscription'&&method!=='GET'&&!admin(me))return send(res,403,{message:'Subscriptions are managed by the server.'});if(method==='GET'){if(key==='users'&&!admin(me))return send(res,403,{message:'Admin only'});let a=db[key];if(key!=='users'&&!(key==='feedback'&&admin(me))&&!(key==='subscriptions'&&admin(me)))a=a.filter(x=>owned(type,x,me));if(u.searchParams.get('filter')){const f=JSON.parse(u.searchParams.get('filter'));a=a.filter(x=>Object.entries(f).every(([k,v])=>x[k]===v))}if(key==='messages')a=[...a].reverse().sort((p1,p2)=>String(p1.created_date||'').localeCompare(String(p2.created_date||'')));return send(res,200,{items:a.map(x=>key==='users'?safeUser(x):x)});}if(method==='POST'){const x={id:id(),created_date:now(),updated_date:now(),...data};if(key!=='users')x.userId=me.id;if(key==='users'){const h=hash(data.password||crypto.randomBytes(12).toString('hex'));x.passwordHash=h.hash;x.passwordSalt=h.salt;delete x.password}db[key].unshift(x);await save();return send(res,201,{item:key==='users'?safeUser(x):x});}const itemId=u.searchParams.get('id');const item=db[key].find(x=>x.id===itemId);if(!item)return send(res,404,{message:'Item not found'});if(!owned(type,item,me))return send(res,403,{message:'Forbidden'});if(method==='PATCH'){Object.assign(item,data,{updated_date:now()});await save();return send(res,200,{item:key==='users'?safeUser(item):item})}if(method==='DELETE'){db[key]=db[key].filter(x=>x.id!==itemId);await save();return send(res,200,{ok:true})}}
 // Streaming variant used by the Codex build screen: Server-Sent Events, one {t:"text"} per piece, then {done:true}.
 // Same quota and model rules as xryonChat. Providers that can't stream send their whole answer as one piece at the end.
 if(p==='/api/functions/xryonChatStream'&&method==='POST'){
   const premium=admin(me)||isPremiumUser(me);
   const k=usageKey(me,'ai');let x=db.usage.find(v=>v.key===k);if(!x){x={key:k,userId:me.id,kind:'ai',count:0};db.usage.push(x)}
   const useFallback=!premium&&(x.count>=10||data.degraded===true);
   x.count++;await save();
   const gate=await codexNexusGate(me,data,premium); // Nexus AI in Codex: 10 per 5 hours for free users, then Xryon Swift
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
   const write=o=>{try{res.write(`data: ${JSON.stringify(o)}\n\n`)}catch{}};
   const ac=new AbortController();res.on('close',()=>ac.abort());
   let sent=0;
   if(gate.meta)write({meta:gate.meta});
   const ping=setInterval(()=>{try{res.write(': ping\n\n')}catch{}},15000); // keeps proxies from closing a slow start
   try{
     const reply=await ai(data.messages||[],`${data.persona||''}\n${data.system_prompt||''}`,{fallback:useFallback,model:resolveCodexModel(gate.model,premium),premium,codex:data.codex===true,nexus:gate.useNexus,onNexusFail:gate.refund,signal:ac.signal,onToken:t=>{sent+=t.length;write({t})}});
     if(reply&&reply.length>sent)write({t:reply.slice(sent)});
     write({done:true});
   }catch(e){write({error:String(e.message||e).slice(0,300)})}
   clearInterval(ping);res.end();return;
 }
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
     // What the person typed with the image (empty when they sent only the picture).
     const lastUserMsg=[...(data.messages||[])].reverse().find(m=>m&&m.role==='user');
     const imageQuestion=(typeof lastUserMsg?.content==='string'?lastUserMsg.content:'').replace(/^\(Attached file:[^)]*\)\s*$/,'').trim().slice(0,1500);
     const descriptions=await Promise.all(imageFileIds.map(async(fid)=>{
       try{
         const token=mintFileToken(fid);
         const publicUrl=`${originOf(req)}/api/files/${fid}?token=${token}`;
         return `- ${await cachedImageDescription(`${me.id}:${fid}`,publicUrl,imageQuestion)}`;
       }catch(e){return `- (Could not read this image: ${e.message})`;}
     }));
     await save();
     if(descriptions.every(d=>d.startsWith('- (Could not read this image'))){
       console.error('All image reads failed:',descriptions.join(' | '));
       imageContext='\nThe user attached image(s), but the image reader is temporarily unavailable, so you could NOT see them. Say so honestly in one short sentence, ask the user to resend the picture in a moment, and do not guess or invent what is in it.';
     } else
     imageContext='\nThe user attached image(s). The image reader looked at them and wrote the notes below. If the image held a question or problem, the notes already contain the worked answer: give that answer to the user straight away, clearly, without asking what they want. If the user wrote instructions with the image, do what they asked using these notes.\n'+descriptions.join('\n');
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

   // Web search toggle: look the question up live and give the AI the results (never for ZIP work).
   let webCtx='',webInfo=null;
   if(data.web_search===true&&!zipCtx){
     try{
       const wk=`w:${me.id}:${Math.floor(Date.now()/60000)}`;
       imageSearchHits.set(wk,(imageSearchHits.get(wk)||0)+1);if(imageSearchHits.size>500)imageSearchHits.delete(imageSearchHits.keys().next().value);
       const tooMany=imageSearchHits.get(wk)>15&&!admin(me);
       const found=tooMany?{results:[],error:'too many searches this minute'}:await webSearch(searchQueryFrom(data.messages));
       webCtx=buildWebContext(found);
       // What the chat shows under the answer: each article's title as a link, its picture (through the signed same-origin proxy) and publisher.
       const signImg=x=>`/api/images/img?u=${encodeURIComponent(x)}&s=${animeSign(x)}`;
       const sources=found.results.slice(0,6).map(r=>({title:r.title,url:r.url,source:r.source||'',date:r.date||'',image:r.image&&animeHostOk(r.image)?signImg(r.image):null}));
       webInfo={used:found.results.length>0,provider:found.provider||null,count:found.results.length,sources};
     }catch(e){console.error('web search failed:',e.message);webCtx=buildWebContext({results:[],error:'search failed'});webInfo={used:false,provider:null,count:0}}
   }
   try{
     const gate=await codexNexusGate(me,data,premium);
     const requestedModel=resolveCodexModel(gate.model,premium);
     const uiModel=resolveUiModel(data.ui_model,premium);
     const reply=await ai(data.messages||[],`${data.persona||''}\n${data.system_prompt||''}${uiModel?`\n${uiModel.style}`:''}${memoryContext}${imageContext}${zipCtx}${webCtx}`,{fallback:useFallback,model:requestedModel,premium,prefer:uiModel?.prefer,vortyx:uiModel?.vortyx,nexus:data.codex===true?gate.useNexus:Boolean(uiModel?.nexus),onNexusFail:gate.refund,codex:data.codex===true});
     // Save the answer here as well, so it is still in the chat if the phone went to sleep, the tab was closed
     // or the person opened another chat before it arrived. The browser then skips its own save.
     let savedId=null;
     try{
       const convo=data.conversation_id&&db.conversations.find(c=>c.id===data.conversation_id&&c.userId===me.id);
       if(convo&&reply){
         const clean=String(reply).replace(/\[\[\s*images?\s*:[^\]]*\]\]/gi,'').trim()||String(reply);
         const m={id:id(),created_date:now(),updated_date:now(),conversation_id:convo.id,role:'assistant',content:clean,userId:me.id,...(data.zip_source?{zip_source:String(data.zip_source).slice(0,500)}:{}),...(webInfo?.sources?.length?{sources:webInfo.sources}:{})};
         db.messages.unshift(m);convo.updated_date=now();await save();savedId=m.id;
       }
     }catch(e){console.error('reply save failed:',e.message)}
     return send(res,200,{reply,codexMeta:gate.meta,limitReached:useFallback,memoryDisabled:useFallback,savedMessageId:savedId,webSearch:webInfo});
   }catch(e){return send(res,502,{error:e.message})}
 }

 // ChatArt chat: modes v6 / v5 / vision, with image upload and image memory.
 // The ChatArt API is stateless, so the last image of each conversation (and short notes about it) is kept on the
 // conversation record and sent again with every follow-up. That is what lets the person say "what colour is it?"
 // three messages after sending a picture and still get an answer about that picture.
 if(p==='/api/functions/charartChat'&&method==='POST'){
   const mode=isCharartMode(data.mode)?data.mode:'v6';
   const k=usageKey(me,'ai');let ux=db.usage.find(v=>v.key===k);if(!ux){ux={key:k,userId:me.id,kind:'ai',count:0};db.usage.push(ux)}
   ux.count++;await save();
   const fileIdOf=fu=>{const m=/^\/api\/files\/([^/?]+)/.exec(String(fu||''));return m&&m[1]};
   const imageFile=fid=>{const f=fid&&db.files.find(x=>x.id===fid&&x.userId===me.id);return f&&f.mime&&f.mime.startsWith('image/')?f:null};
   const convo=data.conversation_id&&db.conversations.find(c=>c.id===data.conversation_id&&c.userId===me.id);
   const history=(Array.isArray(data.messages)?data.messages:[]).map(m=>({role:m.role,content:typeof m.content==='string'?m.content:''}));
   const lastUser=[...history].reverse().find(m=>m.role==='user');
   const userText=String(lastUser?.content||'').replace(/^\(Attached file:[^)]*\)\s*$/,'').trim().slice(0,1500);
   // 1) a picture attached to THIS message, 2) the picture remembered for this conversation, 3) the newest picture already in the thread
   let file=null,isNew=false;
   for(const fu of (Array.isArray(data.new_image_urls)?data.new_image_urls:[])){const f=imageFile(fileIdOf(fu));if(f){file=f;isNew=true;break}}
   if(!file&&convo?.charartImage)file=imageFile(convo.charartImage.fileId);
   if(!file&&convo){
     const older=db.messages.filter(m=>m.conversation_id===convo.id&&m.userId===me.id&&m.role==='user'&&Array.isArray(m.file_urls)&&m.file_urls.length)
       .sort((a,b)=>String(b.created_date||'').localeCompare(String(a.created_date||'')));
     for(const m of older){const f=m.file_urls.map(fileIdOf).map(imageFile).find(Boolean);if(f){file=f;break}}
   }
   if(!file)file=(Array.isArray(data.file_urls)?data.file_urls:[]).map(fileIdOf).map(imageFile).filter(Boolean).pop()||null;
   const sameAsRemembered=Boolean(file&&convo?.charartImage&&convo.charartImage.fileId===file.id);
   const imageNotes=file&&!isNew&&sameAsRemembered?String(convo.charartImage.notes||''):'';
   try{
     const imageUrl=file?`${publicBase(req)}/api/files/${file.id}?token=${mintFileToken(file.id)}`:'';
     const prompt=buildChatPrompt({history,system:'',imageNotes,newImage:Boolean(file&&isNew),userText});
     const {reply,modeUsed}=await charartChat({mode,prompt,imageUrl});
     // Remember the picture for the rest of the conversation. The reply doubles as the notes about it.
     if(convo&&file){
       const keepNotes=isNew||!sameAsRemembered?reply:(convo.charartImage.notes||reply);
       convo.charartImage={fileId:file.id,name:file.name,notes:String(keepNotes).slice(0,1800),at:now()};
     }
     let savedId=null;
     try{
       if(convo&&reply){
         const clean=String(reply).replace(/\[\[\s*images?\s*:[^\]]*\]\]/gi,'').trim()||String(reply);
         const m={id:id(),created_date:now(),updated_date:now(),conversation_id:convo.id,role:'assistant',content:clean,userId:me.id};
         db.messages.unshift(m);convo.updated_date=now();savedId=m.id;
       }
       if(convo)await save();
     }catch(e){console.error('charart reply save failed:',e.message)}
     return send(res,200,{reply,mode:modeUsed,imageRemembered:Boolean(file),savedMessageId:savedId,limitReached:false});
   }catch(e){console.error('charartChat failed:',e.message);return send(res,502,{error:'The AI service is busy right now. Please try again in a moment.'})}
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
     const subject=String(data.subject||'').trim().slice(0,700); // the person's own words, without the style boilerplate
     // GeniGPT edits a picture by public URL: give it a short-lived signed link to each of the person's own files.
     const inputUrls=[];
     for(const raw of (Array.isArray(data.image_urls)?data.image_urls:[]).slice(0,3)){
       const m=/^\/api\/files\/([^/?]+)/.exec(String(raw||''));
       const f=m&&db.files.find(x=>x.id===m[1]&&x.userId===me.id&&x.mime?.startsWith('image/'));
       if(f)inputUrls.push(`${publicBase(req)}/api/files/${f.id}?token=${mintFileToken(f.id)}`);
     }
     const out=await generateImage(prompt,inputs,{shortcut,subject,inputUrls});
     const url=await saveGeneratedImage(me,out.mime,out.bytes);
     await bumpUsage(me,'image',5); // only successful images count against the daily limit
     return send(res,200,{url});
   }catch(e){console.error('generateImage failed:',e.message);return send(res,502,{error:'image_unavailable'})}
 }
 if(p==='/api/functions/textImage'&&method==='POST'){
   // /textimage: simple text pictures with custom colors. Same quota and same generic error as generateImage.
   const parsed=parseTextImage(String(data.text||'').slice(0,600));
   if(!parsed.text)return send(res,400,{error:'bad_request'});
   if(!usageAllowed(me,'image',5))return send(res,429,{error:'limit_reached'});
   try{
     const out=await makeTextImage(parsed);
     const url=await saveGeneratedImage(me,out.mime,out.bytes);
     await bumpUsage(me,'image',5);
     return send(res,200,{url,text:parsed.text,background:parsed.background,color:parsed.color,emojiStyle:parsed.emojiStyle});
   }catch(e){console.error('textImage failed:',e.message);return send(res,502,{error:'image_unavailable'})}
 }
 if((p==='/api/functions/memeImage'||p==='/api/functions/memeTextImage')&&method==='POST'){
   const meme=p.endsWith('/memeImage');
   if(!usageAllowed(me,'image',5))return send(res,429,{error:'limit_reached'});
   const fields=meme
     ? {topText:String(data.topText||'').slice(0,300),bottomText:String(data.bottomText||'').slice(0,300),backgroundImage:String(data.backgroundImage||'').slice(0,1500),fontFamily:String(data.fontFamily||'').slice(0,100),textColor:String(data.textColor||'').slice(0,80),strokeColor:String(data.strokeColor||'').slice(0,80)}
     : {text:String(data.text||'').slice(0,600),width:String(data.width||''),height:String(data.height||''),fontFamily:String(data.fontFamily||'').slice(0,100),textColor:String(data.textColor||'').slice(0,80),strokeColor:String(data.strokeColor||'').slice(0,80)};
   if(meme?(!fields.topText.trim()||!fields.bottomText.trim()):!fields.text.trim())return send(res,400,{error:'bad_request'});
   try{
     const endpoint=meme?'https://prexzyapis.com/imagecreator/meme':'https://prexzyapis.com/imagecreator/memeText';
     const params=new URLSearchParams();
     for(const [k,v] of Object.entries(fields))if(v!=='')params.set(k,v);
     const upstream=await fetch(`${endpoint}?${params.toString()}`,{signal:AbortSignal.timeout(90000),headers:{'Accept':'image/*,application/json'}});
     if(!upstream.ok)throw new Error(`meme provider ${upstream.status}`);
     const type=upstream.headers.get('content-type')||'';
     let url='';
     if(type.includes('image/')){
       const bytes=Buffer.from(await upstream.arrayBuffer());
       const saved=await saveGeneratedImage(me,type.split(';')[0],bytes);
       url=saved;
     }else{
       const body=await upstream.json();
       url=body.url||body.imageUrl||body.image_url||body.image||body.result?.url||body.result?.imageUrl||body.data?.url||body.data?.imageUrl||body.data?.image_url||body.data?.image||' ';
       if((!url||url===' ')&&typeof body.data==='string')url=body.data;
       if(url===' ')url='';
       if(!url)throw new Error('meme provider returned no image URL');
     }
     await bumpUsage(me,'image',5);
     return send(res,200,{url,...(meme?{topText:fields.topText,bottomText:fields.bottomText}:{text:fields.text})});
   }catch(e){console.error('meme image request failed:',e.message);return send(res,502,{error:'image_unavailable'});}
 }
 if(p==='/api/premium/status'&&method==='GET'){const f=db.settings.freePremium||{};return send(res,200,{freePremium:{enabled:f.enabled===true,since:f.enabled===true?f.enabledAt||null:null}})}
 if(p==='/api/admin/free-premium'&&method==='POST'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const want=data.enabled===true,was=freePremiumOn();
   db.settings.freePremium={...(db.settings.freePremium||{}),enabled:want,...(want&&!was?{enabledAt:now(),enabledBy:me.email}:{}),...(!want&&was?{disabledAt:now(),disabledBy:me.email}:{})};
   // Turning it on tells every user right away: the existing broadcast popup picks this up within ~30s.
   if(want&&!was){const fb={id:id(),title:'Premium is free for everyone',message:'Xyron Premium is now unlocked for all users. Enjoy higher limits, advanced features and priority processing at no cost.',url:'/premium',created_by:me.id,created_date:now(),kind:'free_premium'};db.broadcasts.unshift(fb);setTimeout(()=>pushBroadcast(fb),500)}
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
 if(p==='/api/functions/adminChats'&&method==='POST'){
   if(!admin(me))return send(res,403,{message:'Admin only'});
   const byId=new Map(db.users.map(x=>[x.id,x]));
   if(data.conversation_id){
     const c=db.conversations.find(x=>x.id===data.conversation_id);if(!c)return send(res,404,{message:'Chat not found'});
     const owner=byId.get(c.userId);
     const messages=db.messages.filter(m=>m.conversation_id===c.id).sort((a,b)=>String(a.created_date||'').localeCompare(String(b.created_date||''))).slice(0,500)
       .map(m=>({id:m.id,role:m.role,content:String(m.content||'').slice(0,8000),created_date:m.created_date,attachments:Array.isArray(m.file_urls)?m.file_urls.length:0}));
     return send(res,200,{conversation:{id:c.id,title:c.title||'Untitled',email:owner?.email||owner?.phone||'unknown',name:owner?.full_name||''},messages});
   }
   const q=String(data.q||'').trim().toLowerCase().slice(0,100);
   const counts=new Map();for(const m of db.messages)counts.set(m.conversation_id,(counts.get(m.conversation_id)||0)+1);
   let list=db.conversations.map(c=>{const o=byId.get(c.userId);return{id:c.id,title:c.title||'Untitled',email:o?.email||'unknown',name:o?.full_name||'',messages:counts.get(c.id)||0,updated_date:c.updated_date||c.created_date||''}});
   if(q)list=list.filter(c=>c.email.toLowerCase().includes(q)||c.title.toLowerCase().includes(q)||c.name.toLowerCase().includes(q));
   list.sort((a,b)=>String(b.updated_date).localeCompare(String(a.updated_date)));
   return send(res,200,{total:list.length,conversations:list.slice(0,200)});
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
handler=(req,res)=>route(req,res).catch(e=>{console.error(e);send(res,500,{message:'Internal server error'})});console.log('Xyron ready');


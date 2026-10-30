import React, { useMemo, useState } from "react";
import { Gamepad2, RotateCcw, X, Crown, Dice5, Spade, Grid2X2, Swords } from "lucide-react";
import { Riddles, Trivia, GuessNumber } from "./GameExtras";

const GAMES = [
  { id: "ttt", name: "Tic-Tac-Toe", desc: "Quick battle", emoji: "⭕", cover: "/games/ttt.svg" },
  { id: "riddles", name: "Riddles", desc: "Test your brain", emoji: "🧠", cover: "/games/riddles.svg" },
  { id: "trivia", name: "Trivia", desc: "Show what you know", emoji: "⚡", cover: "/games/trivia.svg" },
  { id: "guess", name: "Guess the Number", desc: "Can you beat me?", emoji: "🔢", cover: "/games/guess.svg" },
  { id: "chess", name: "Chess", desc: "Classic strategy", emoji: "♟️", icon: Crown, tint: "from-slate-700 to-slate-950" },
  { id: "ludo", name: "Ludo", desc: "Roll, race, capture", emoji: "🎲", icon: Dice5, tint: "from-emerald-700 to-emerald-950" },
  { id: "blackjack", name: "Blackjack", desc: "Beat the dealer", emoji: "🃏", icon: Spade, tint: "from-rose-700 to-rose-950" },
  { id: "war", name: "War", desc: "Flip and win the deck", emoji: "⚔️", icon: Swords, tint: "from-amber-700 to-amber-950" },
  { id: "memory", name: "Memory Match", desc: "Find the pairs", emoji: "🧩", icon: Gamepad2, tint: "from-violet-700 to-violet-950" },
];
const shuffled = (arr) => [...arr].sort(() => Math.random() - 0.5);
const newDeck = () => shuffled(["A","2","3","4","5","6","7","8","9","10","J","Q","K"].flatMap((r) => ["♠","♥","♦","♣"].map((s) => ({ r, s, id: `${r}${s}-${Math.random()}` }))));
const cardValue = (c) => c.r === "A" ? 11 : ["K","Q","J"].includes(c.r) ? 10 : Number(c.r);
function score(hand) { let n = hand.reduce((s,c)=>s+cardValue(c),0); let aces=hand.filter(c=>c.r==="A").length; while(n>21&&aces-- >0)n-=10; return n; }
function Button({ children, onClick, disabled=false, className="" }) { return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-xl border border-white/15 px-3 py-2 text-sm font-medium transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>{children}</button>; }

export function detectGameIntent(content = "") {
  const t = String(content).toLowerCase().trim();
  if (/^(ludo|chess|blackjack|cards?|war|tic.?tac.?toe|memory|riddles?|trivia|guess( the number)?)$/i.test(t)) return ({ludo:"ludo",chess:"chess",blackjack:"blackjack",card:"war",cards:"war",war:"war",memory:"memory",riddle:"riddles",riddles:"riddles",trivia:"trivia",guess:"guess","guess the number":"guess"})[t] || "hub";
  if (/\b(explain|history|rules of|how to play|strategy for|build a|code a|develop)\b/.test(t) && !/\b(let'?s play|play with me|start a game|play (chess|ludo|cards|blackjack|tic.?tac.?toe|memory|war))\b/.test(t)) return null;
  if (/\b(ludo)\b/.test(t) && /\b(play|game|start|let'?s|want|bored|open)\b/.test(t)) return "ludo";
  if (/\b(chess)\b/.test(t) && /\b(play|game|start|let'?s|want|bored|open)\b/.test(t)) return "chess";
  if (/\b(blackjack)\b/.test(t) && /\b(play|game|start|let'?s|want|open)\b/.test(t)) return "blackjack";
  if (/\b(riddles?)\b/.test(t) && /\b(play|game|start|let'?s|give|ask|open)\b/.test(t)) return "riddles";
  if (/\b(trivia|quiz)\b/.test(t) && /\b(play|game|start|let'?s|give|ask|open)\b/.test(t)) return "trivia";
  if (/\bguess (the|a) number\b/.test(t)) return "guess";
  if (/\b(war card|play war|card game|play cards)\b/.test(t)) return "war";
  if (/\b(tic.?tac.?toe)\b/.test(t) && /\b(play|game|start|let'?s|open)\b/.test(t)) return "ttt";
  if (/\b(memory match|matching game)\b/.test(t) && /\b(play|game|start|let'?s|open)\b/.test(t)) return "memory";
  if (/\b(show|list|available|choose|pick|play|start|let'?s play)\b/.test(t) && /\b(game|games|bored|entertain me)\b/.test(t)) return "hub";
  if (/\b(want to play a game|shall we play|let'?s play a game|play a game with me|i'?m bored.*(game|play)|game\?)\b/.test(t)) return "hub";
  return null;
}

export default function GameCenter({ initialGame = "hub", onClose }) {
  const [game, setGame] = useState(initialGame);
  const [chosen, setChosen] = useState("ttt");
  const [runKey, setRunKey] = useState(0);
  const [notice, setNotice] = useState("Choose a game and challenge Xryon.");
  const [ttt, setTtt] = useState(Array(9).fill(""));
  const [memory, setMemory] = useState(() => shuffled(["🐱","🐱","🌙","🌙","🍀","🍀","🚀","🚀","🎧","🎧","⭐","⭐"]));
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [deck, setDeck] = useState(() => newDeck());
  const [player, setPlayer] = useState([]);
  const [dealer, setDealer] = useState([]);
  const [blackjackOver, setBlackjackOver] = useState(false);
  const [warDeck, setWarDeck] = useState(() => { const cards = newDeck(); return { you: cards.slice(0,26), ai: cards.slice(26,52) }; });
  const [warCount, setWarCount] = useState(0);
  const [ludo, setLudo] = useState({ turn: 0, roll: null, tokens: [[0,0,0,0],[0,0,0,0]], done: false });
  const [chess, setChess] = useState(() => initialChess());
  const [selected, setSelected] = useState(null);
  const [chessTurn, setChessTurn] = useState("w");
  const [chessOver, setChessOver] = useState(false);

  const reset = (id = game) => {
    setRunKey((k) => k + 1); setGame(id); setNotice("New match started. Your turn!");
    setTtt(Array(9).fill("")); setMemory(shuffled(["🐱","🐱","🌙","🌙","🍀","🍀","🚀","🚀","🎧","🎧","⭐","⭐"]));
    setFlipped([]); setMatched([]); setDeck(newDeck()); setPlayer([]); setDealer([]); setBlackjackOver(false);
    const warCards = newDeck(); setWarDeck({ you: warCards.slice(0,26), ai: warCards.slice(26,52) }); setWarCount(0);
    setLudo({turn:0,roll:null,tokens:[[0,0,0,0],[0,0,0,0]],done:false}); setChess(initialChess()); setSelected(null); setChessTurn("w"); setChessOver(false);
    if (id === "blackjack") startBlackjack();
  };
  const startBlackjack = () => { const d = newDeck(); setPlayer(d.slice(0,2)); setDealer(d.slice(2,4)); setDeck(d.slice(4)); setBlackjackOver(false); setNotice("Your move: hit or stand."); };
  const hit = () => { if (blackjackOver || !deck.length) return; const hand=[...player,deck[0]]; setPlayer(hand); setDeck(deck.slice(1)); if(score(hand)>21){setBlackjackOver(true);setNotice("Bust! Xryon wins this round.");} };
  const stand = () => { if(blackjackOver)return; let d=[...dealer], rest=[...deck]; while(score(d)<17&&rest.length){d.push(rest.shift());} setDealer(d);setDeck(rest);setBlackjackOver(true);const a=score(player),b=score(d);setNotice(a>21?"Bust! Xryon wins.":b>21||a>b?"You win!":a===b?"Push — it's a tie.":"Xryon wins this round."); };
  const tttMove = (i) => {
    if(ttt[i] || winner(ttt) || ttt.every(Boolean))return;
    const next=[...ttt];next[i]="X"; if(winner(next)){setTtt(next);setNotice("You win! Great game.");return;}
    if(next.every(Boolean)){setTtt(next);setNotice("It's a draw.");return;}
    const ai=bestTttMove(next);next[ai]="O";setTtt(next);setNotice(winner(next)==="O"?"Xryon wins this round.":next.every(Boolean)?"It's a draw.":"Your turn.");
  };
  const memoryFlip = (i) => {
    if(flipped.includes(i)||matched.includes(i)||flipped.length===2)return;
    const next=[...flipped,i];setFlipped(next);
    if(next.length===2){if(memory[next[0]]===memory[next[1]]){setMatched(m=>[...m,...next]);setNotice("Match found! Keep going.");setFlipped([]);}else{setNotice("Not a match — try again.");setTimeout(()=>setFlipped([]),750);}}
  };
  const warPlay = () => {
    if(!warDeck.you.length||!warDeck.ai.length){setNotice(warDeck.you.length?"You win the deck!":"Xryon wins the deck.");return;}
    const a=warDeck.you[0],b=warDeck.ai[0],v=c=>c.r==="A"?14:["K","Q","J"].includes(c.r)?({K:13,Q:12,J:11}[c.r]):Number(c.r);
    const you=[...warDeck.you.slice(1)],ai=[...warDeck.ai.slice(1)];
    if(v(a)>v(b))you.push(a,b);else if(v(b)>v(a))ai.push(a,b);else {you.push(a);ai.push(b);}
    setWarDeck({you,ai});setWarCount(n=>n+1);setNotice(v(a)===v(b)?"War! Tie cards returned to each side.":v(a)>v(b)?"You win this round!":"Xryon wins this round.");
  };
  const rollLudo = () => {
    if(ludo.done||ludo.roll!==null)return;
    const roll=1+Math.floor(Math.random()*6);
    setLudo(s=>({...s,roll}));setNotice(`You rolled ${roll}. Select a token to move.`);
    if(ludo.turn===1){const valid=ludo.tokens[1].map((p,i)=>({p,i})).filter(x=>x.p>0&&x.p<40||x.p===0&&roll===6);setTimeout(()=>{setLudo(s=>{if(s.done)return s;const choices=s.tokens[1].map((p,i)=>({p,i})).filter(x=>(x.p>0&&x.p<40)||(x.p===0&&roll===6));if(!choices.length)return {...s,roll:null,turn:0};const chosen=choices[Math.floor(Math.random()*choices.length)];const tokens=s.tokens.map(a=>[...a]);tokens[1][chosen.i]=chosen.p===0?1:Math.min(40,chosen.p+roll);return {...s,tokens,roll:null,turn:0,done:tokens[1].every(a=>a===40)};});},600);}
  };
  const moveLudo = (i) => {
    if(ludo.turn!==0||ludo.roll===null||ludo.done)return;
    const roll=ludo.roll, p=ludo.tokens[0][i]; if((p===0&&roll!==6)||(p>0&&p+roll>40)){setNotice("That token cannot move with this roll.");return;}
    const tokens=ludo.tokens.map(a=>[...a]);tokens[0][i]=p===0?1:p+roll;
    // Captures send a rival token back to base unless on the final home lane.
    if(tokens[0][i]<40){const rival=tokens[1].findIndex(x=>x>0&&x<40&&x===tokens[0][i]);if(rival>=0)tokens[1][rival]=0;}
    const done=tokens[0].every(x=>x===40);setLudo({tokens,roll:null,turn:done?0:1,done});setNotice(done?"You brought all tokens home — you win!":"Xryon’s turn.");
    if(!done)setTimeout(()=>{const r=1+Math.floor(Math.random()*6);setLudo(s=>{if(s.done)return s;let ts=s.tokens.map(a=>[...a]);const valid=ts[1].map((p,j)=>({p,j})).filter(x=>(x.p===0&&r===6)||(x.p>0&&x.p+r<=40));if(valid.length){const c=valid[Math.floor(Math.random()*valid.length)];ts[1][c.j]=c.p===0?1:c.p+r;}return {tokens:ts,roll:null,turn:0,done:ts[1].every(x=>x===40)};});setNotice(`Xryon rolled ${r}. Your turn.`);},700);
  };

  const playChess = (r,c) => {
    if(chessOver||chessTurn!=="w")return;
    const piece=chess[r][c];
    if(selected){const [sr,sc]=selected; if(sr===r&&sc===c){setSelected(null);return;}
      if(validChessMove(chess,sr,sc,r,c,"w")){const board=chess.map(row=>[...row]);board[r][c]=board[sr][sc];board[sr][sc]="";if(board[r][c].toLowerCase()==="p"&&r===0)board[r][c]="Q";setChess(board);setSelected(null);setChessTurn("b");setNotice("Xryon is thinking…");setTimeout(()=>{setChess(b=>{const moves=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)if(b[y][x]&&b[y][x]===b[y][x].toLowerCase())for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++)if(validChessMove(b,y,x,yy,xx,"b"))moves.push([y,x,yy,xx]);if(!moves.length){setChessOver(true);setNotice("No legal moves remain. Start a new game.");setChessTurn("w");return b;}const m=moves[Math.floor(Math.random()*moves.length)],n=b.map(row=>[...row]);n[m[2]][m[3]]=n[m[0]][m[1]];n[m[0]][m[1]]="";if(n[m[2]][m[3]]==="p"&&m[2]===7)n[m[2]][m[3]]="q";setChessTurn("w");setNotice("Your turn. Choose a white piece.");return n;});},450);}
      else if(piece&&piece===piece.toUpperCase()){setSelected([r,c]);}
      else setSelected(null);
    } else if(piece&&piece===piece.toUpperCase())setSelected([r,c]);
  };

  return <section className="my-3 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#101010] text-white shadow-2xl" aria-label="Xryon games">
    <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-black"><Gamepad2 size={19}/></span><div><div className="font-semibold">🎮 Game Zone</div><div className="text-xs text-white/50">Play together · No API needed</div></div></div>
      <div className="flex gap-2"><Button onClick={()=>reset(game)}><RotateCcw size={14} className="mr-1 inline"/>Restart</Button>{onClose&&<Button onClick={onClose} aria-label="Close games"><X size={16}/></Button>}</div>
    </header>
    {game==="hub" ? <div className="p-4">
      <p className="mb-3 text-sm text-white/70">Choose a game and let's start!</p>
      <div className="grid grid-cols-2 gap-3">{GAMES.map((g)=>{const Icon=g.icon;const on=chosen===g.id;return <button key={g.id} type="button" onClick={()=>setChosen(g.id)} onDoubleClick={()=>reset(g.id)} aria-pressed={on} className={`overflow-hidden rounded-2xl border p-2 text-left transition ${on?"border-white/50 bg-white/[0.12]":"border-white/10 bg-transparent hover:border-white/30"}`}>
        <div className="aspect-[5/3] w-full overflow-hidden rounded-xl bg-black">{g.cover?<img src={g.cover} alt="" loading="lazy" className="h-full w-full object-cover"/>:<div className={`grid h-full w-full place-items-center bg-gradient-to-br ${g.tint}`}>{Icon&&<Icon size={40} className="text-white/90"/>}</div>}</div>
        <div className="mt-2 flex items-center gap-1.5 px-1 text-sm font-semibold"><span>{g.emoji}</span>{g.name}</div>
        <div className="px-1 pb-1 text-xs text-white/55">{g.desc}</div>
      </button>;})}</div>
      <button type="button" onClick={()=>reset(chosen)} className="mt-3 w-full rounded-xl bg-white py-2.5 text-sm font-semibold text-black transition hover:bg-white/90">Play Now 🎮</button>
    </div> : <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3"><button onClick={()=>setGame("hub")} className="text-xs text-white/60 hover:text-white">← All games</button><span className="text-xs text-white/60">{GAMES.find(g=>g.id===game)?.name} · You vs Xryon</span></div>
      <div className="p-4">
      {game==="riddles"&&<Riddles key={runKey} setNotice={setNotice}/>}
      {game==="trivia"&&<Trivia key={runKey} setNotice={setNotice}/>}
      {game==="guess"&&<GuessNumber key={runKey} setNotice={setNotice}/>}
      {game==="ttt"&&<><div className="mx-auto grid max-w-[300px] grid-cols-3 gap-2">{ttt.map((v,i)=><button key={i} onClick={()=>tttMove(i)} className="aspect-square rounded-xl border border-white/15 bg-white/[0.04] text-4xl font-semibold hover:bg-white/10">{v}</button>)}</div><div className="mt-3 text-center text-sm text-white/70">You: X · Xryon: O {winner(ttt)&&`· Winner: ${winner(ttt)}`}</div></>}
      {game==="memory"&&<><div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{memory.map((v,i)=><button key={i} onClick={()=>memoryFlip(i)} className="aspect-square rounded-xl border border-white/15 bg-white/[0.05] text-2xl transition hover:bg-white/10">{matched.includes(i)||flipped.includes(i)?v:"?"}</button>)}</div><p className="mt-3 text-center text-xs text-white/60">Pairs found: {matched.length/2} / 6</p></>}
      {game==="blackjack"&&<><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="mb-1 text-xs uppercase tracking-wide text-white/50">Xryon · {blackjackOver?score(dealer):"Hidden card"}</p><div className="flex gap-2">{dealer.map((c,i)=><PlayingCard key={c.id} card={c} hidden={!blackjackOver&&i===1}/>)}</div><p className="mb-1 mt-4 text-xs uppercase tracking-wide text-white/50">You · {score(player)}</p><div className="flex gap-2">{player.map(c=><PlayingCard key={c.id} card={c}/>)}</div></div><div className="mt-3 flex gap-2">{player.length===0?<Button onClick={startBlackjack}>Deal cards</Button>:<><Button disabled={blackjackOver} onClick={hit}>Hit</Button><Button disabled={blackjackOver} onClick={stand}>Stand</Button></>}<Button onClick={()=>reset("blackjack")}>New hand</Button></div></>}
      {game==="war"&&<><div className="grid grid-cols-2 gap-3 text-center"><div className="rounded-xl border border-white/10 p-3"><div className="text-xs text-white/50">You</div><div className="my-3"><PlayingCard card={warDeck.you[0]}/></div><div className="text-sm">{warDeck.you.length} cards left</div></div><div className="rounded-xl border border-white/10 p-3"><div className="text-xs text-white/50">Xryon</div><div className="my-3"><PlayingCard card={warDeck.ai[0]}/></div><div className="text-sm">{warDeck.ai.length} cards left</div></div></div><Button className="mt-3 w-full" disabled={!warDeck.you.length||!warDeck.ai.length} onClick={warPlay}>Flip cards</Button><p className="mt-2 text-center text-xs text-white/50">Rounds played: {warCount}</p></>}
      {game==="ludo"&&<><div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="mb-3 grid grid-cols-2 gap-3">{ludo.tokens.map((tokens,side)=><div key={side} className={`rounded-xl border p-3 ${side===0?"border-white/50":"border-white/15"}`}><div className="mb-2 text-sm font-semibold">{side===0?"You":"Xryon"}</div><div className="grid grid-cols-4 gap-1">{tokens.map((p,i)=><div key={i} className={`grid aspect-square place-items-center rounded-lg text-xs ${side===0?"bg-white text-black":"bg-white/10 text-white"}`} title={`Token ${i+1}`}>{p===0?"●":p===40?"🏠":p}</div>)}</div><div className="mt-1 text-xs text-white/50">Tokens home: {tokens.filter(x=>x===40).length}/4</div></div>)}</div><div className="text-center"><div className="mb-2 text-sm">{ludo.roll===null?"Roll the dice":`Dice: ${ludo.roll}`}</div>{ludo.turn===0&&ludo.roll===null&&<Button onClick={rollLudo}><Dice5 size={15} className="mr-1 inline"/>Roll dice</Button>}{ludo.turn===0&&ludo.roll!==null&&<div className="grid grid-cols-4 gap-2">{ludo.tokens[0].map((p,i)=><Button key={i} onClick={()=>moveLudo(i)} disabled={(p===0&&ludo.roll!==6)||(p>0&&p+ludo.roll>40)}>Token {i+1}<span className="block text-xs opacity-60">{p===0?"Base":p===40?"Home":`${p}/40`}</span></Button>)}</div>}</div></div><p className="mt-2 text-xs text-white/50">Playable Ludo-style race: roll a 6 to leave base, capture rivals, and reach home. This compact version uses a shared track rather than the full traditional board.</p></>}
      {game==="chess"&&<><div className="mx-auto grid aspect-square w-full max-w-[400px] grid-cols-8 overflow-hidden rounded-lg border border-white/20">{chess.flatMap((row,r)=>row.map((piece,c)=><button key={`${r}-${c}`} onClick={()=>playChess(r,c)} aria-label={`Chess square ${r+1},${c+1}`} className={`grid aspect-square place-items-center text-[clamp(1.1rem,5vw,2.2rem)] ${((r+c)%2===0)?"bg-[#deded7] text-[#111]":"bg-[#555753] text-white"} ${selected?.[0]===r&&selected?.[1]===c?"outline outline-4 outline-yellow-400":""}`}>{piece?chessGlyph(piece):""}</button>))}</div><p className="mt-2 text-xs text-white/50">Chess uses legal piece movement and an AI reply. Advanced rule enforcement (check, castling, en passant, and full checkmate detection) is not yet included in this version.</p><Button className="mt-2" onClick={()=>reset("chess")}>New chess game</Button></>}
      <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/75">{notice}</div>
      </div></>}
  </section>;
}
function PlayingCard({card,hidden=false}) { return <div className={`grid h-20 w-14 shrink-0 place-items-center rounded-lg border text-xl shadow ${hidden?"border-white/20 bg-neutral-800 text-white":"border-black/10 bg-white text-black"} ${!hidden&&["♥","♦"].includes(card.s)?"text-red-600":""}`}>{hidden?"✦":<span>{card.r}<br/>{card.s}</span>}</div>; }
function winner(b){for(const [a,c,d] of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(b[a]&&b[a]===b[c]&&b[a]===b[d])return b[a];return null;}
function initialChess(){return ["rnbqkbnr","pppppppp","........","........","........","........","PPPPPPPP","RNBQKBNR"].map(r=>r.split("").map(c=>c==="."?"":c));}
function chessGlyph(p){return ({K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"})[p]||p;}
function validChessMove(b,sr,sc,r,c,side){
  if(sr===r&&sc===c)return false;const p=b[sr][sc],target=b[r][c];if(!p||((side==="w")!==(p===p.toUpperCase()))||target&&((side==="w")===(target===target.toUpperCase())))return false;
  const dr=r-sr,dc=c-sc,ar=Math.abs(dr),ac=Math.abs(dc),type=p.toLowerCase();
  if(type==="p"){const dir=side==="w"?-1:1;if(dc===0&&!target&&dr===dir)return true;if(dc===0&&!target&&dr===2*dir&&sr===(side==="w"?6:1)&&!b[sr+dir][sc])return true;return ac===1&&dr===dir&&!!target;}
  if(type==="n")return ar*ac===2;
  if(type==="k")return Math.max(ar,ac)===1;
  if(type==="r"&&dr!==0&&dc!==0)return false;if(type==="b"&&ar!==ac)return false;if(type==="q"&&dr!==0&&dc!==0&&ar!==ac)return false;
  const steps=Math.max(ar,ac),sy=Math.sign(dr),sx=Math.sign(dc);for(let i=1;i<steps;i++)if(b[sr+sy*i]?.[sc+sx*i])return false;return steps>0;
}

function bestTttMove(b){
  // Minimax: Xryon (O) plays perfectly, with a little randomness among equal moves.
  const score=(bd,turn)=>{const w=winner(bd);if(w==="O")return 1;if(w==="X")return -1;if(bd.every(Boolean))return 0;
    const sc=bd.map((v,i)=>v?null:score(Object.assign([...bd],{[i]:turn}),turn==="O"?"X":"O")).filter(v=>v!==null);return turn==="O"?Math.max(...sc):Math.min(...sc);};
  let best=-2,moves=[];b.forEach((v,i)=>{if(v)return;const sc=score(Object.assign([...b],{[i]:"O"}),"X");if(sc>best){best=sc;moves=[i];}else if(sc===best)moves.push(i);});
  return moves[Math.floor(Math.random()*moves.length)];
}

import React, { useMemo, useState } from "react";

const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const norm = (s) => String(s).toLowerCase().replace(/^(a|an|the)\s+/, "").replace(/[^a-z0-9 ]/g, "").trim();
const Btn = ({ children, onClick, disabled, className = "" }) => (
  <button type="button" disabled={disabled} onClick={onClick} className={`rounded-xl border border-white/15 px-3 py-2 text-sm font-medium transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>{children}</button>
);

const RIDDLES = [
  ["What has keys but can't open locks?", ["piano", "keyboard"], "You can play it."],
  ["What gets wetter the more it dries?", ["towel"], "Think bathroom."],
  ["What has hands but can't clap?", ["clock", "watch"], "It tells you something."],
  ["I speak without a mouth and hear without ears. What am I?", ["echo"], "Mountains love me."],
  ["What can travel around the world while staying in a corner?", ["stamp"], "Found on letters."],
  ["The more you take, the more you leave behind. What are they?", ["footsteps", "steps", "footstep"], "Walk and see."],
  ["What has a head and a tail but no body?", ["coin"], "Flip it."],
  ["What goes up but never comes down?", ["age"], "Happy birthday!"],
  ["What has many teeth but can't bite?", ["comb"], "Fix your hair."],
  ["What is full of holes but still holds water?", ["sponge"], "Kitchen item."],
  ["What can you catch but not throw?", ["cold"], "Achoo!"],
  ["What runs but never walks, has a mouth but never talks?", ["river"], "It flows."],
  ["What has one eye but can't see?", ["needle"], "Sewing time."],
  ["What month has 28 days?", ["all", "every month", "all of them", "all months"], "Read it carefully."],
  ["What building has the most stories?", ["library"], "Books everywhere."],
];

export function Riddles({ setNotice }) {
  const deck = useMemo(() => shuffle(RIDDLES), []);
  const [i, setI] = useState(0);
  const [val, setVal] = useState("");
  const [score, setScore] = useState(0);
  const [hint, setHint] = useState(false);
  const [state, setState] = useState("ask");
  const done = i >= deck.length;
  const [q, answers, h] = deck[Math.min(i, deck.length - 1)];
  const next = () => { setI((n) => n + 1); setVal(""); setHint(false); setState("ask"); setNotice("Next riddle. 🧠"); };
  const submit = () => {
    if (!val.trim() || state !== "ask") return;
    const ok = answers.some((a) => norm(a) === norm(val));
    setState(ok ? "right" : "wrong");
    if (ok) { setScore((s) => s + (hint ? 1 : 2)); setNotice("Correct! 🔥"); } else setNotice("Not quite. Try again or reveal it.");
  };
  if (done) return <div className="text-center"><div className="text-3xl">🏆</div><p className="mt-2 text-lg font-semibold">All riddles done! Score: {score}</p><Btn className="mt-3" onClick={() => { setI(0); setScore(0); }}>Play again</Btn></div>;
  return <div>
    <div className="mb-2 flex justify-between text-xs text-white/50"><span>Riddle {i + 1} / {deck.length}</span><span>Score: {score}</span></div>
    <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-base font-medium">{q}</p>
    {hint && <p className="mt-2 text-xs text-yellow-300/80">💡 {h}</p>}
    {state === "ask" || state === "wrong" ? <div className="mt-3 flex gap-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Type your answer…" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black px-3 py-2 text-sm outline-none focus:border-white/40" />
      <Btn onClick={submit}>Submit</Btn>
    </div> : <p className="mt-3 text-sm text-green-400">✅ Right answer: {answers[0]}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      {!hint && state !== "right" && <Btn onClick={() => setHint(true)}>💡 Hint</Btn>}
      {state === "wrong" && <Btn onClick={() => { setState("right"); setVal(""); setNotice(`The answer was: ${answers[0]}`); }}>Reveal</Btn>}
      <Btn onClick={next}>{state === "right" ? "Next →" : "Skip →"}</Btn>
    </div>
  </div>;
}

const TRIVIA = [
  ["What is the capital of Nigeria?", ["Abuja", "Lagos", "Kano", "Port Harcourt"], 0],
  ["Which planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter", "Mercury"], 1],
  ["How many continents are there?", ["5", "6", "7", "8"], 2],
  ["Who painted the Mona Lisa?", ["Picasso", "Van Gogh", "Da Vinci", "Michelangelo"], 2],
  ["What is the largest ocean on Earth?", ["Atlantic", "Indian", "Arctic", "Pacific"], 3],
  ["Which language is mainly used to style web pages?", ["HTML", "CSS", "SQL", "Python"], 1],
  ["How many players are on a football (soccer) team on the pitch?", ["9", "10", "11", "12"], 2],
  ["What gas do plants absorb from the air?", ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], 2],
  ["What is the longest river in Africa?", ["Niger", "Nile", "Congo", "Zambezi"], 1],
  ["Which country won the 2022 FIFA World Cup?", ["France", "Brazil", "Argentina", "Germany"], 2],
  ["What does CPU stand for?", ["Central Processing Unit", "Computer Power Unit", "Core Program Utility", "Central Program Update"], 0],
  ["What is H2O commonly called?", ["Salt", "Water", "Hydrogen", "Acid"], 1],
  ["Which is the smallest prime number?", ["0", "1", "2", "3"], 2],
  ["Who wrote 'Things Fall Apart'?", ["Wole Soyinka", "Chinua Achebe", "Chimamanda Adichie", "Ben Okri"], 1],
  ["How many minutes are in two hours?", ["100", "120", "150", "180"], 1],
];

export function Trivia({ setNotice }) {
  const [round, setRound] = useState(() => shuffle(TRIVIA).slice(0, 8));
  const [i, setI] = useState(0);
  const [pick, setPick] = useState(null);
  const [score, setScore] = useState(0);
  const done = i >= round.length;
  const [q, opts, correct] = round[Math.min(i, round.length - 1)];
  const choose = (n) => {
    if (pick !== null) return;
    setPick(n);
    if (n === correct) { setScore((s) => s + 1); setNotice("Correct! ⚡"); } else setNotice(`Oops! It was ${opts[correct]}.`);
  };
  if (done) return <div className="text-center"><div className="text-3xl">{score >= 6 ? "🏆" : "👏"}</div><p className="mt-2 text-lg font-semibold">You scored {score} / {round.length}</p><Btn className="mt-3" onClick={() => { setRound(shuffle(TRIVIA).slice(0, 8)); setI(0); setScore(0); setPick(null); }}>New round</Btn></div>;
  return <div>
    <div className="mb-2 flex justify-between text-xs text-white/50"><span>Question {i + 1} / {round.length}</span><span>Score: {score}</span></div>
    <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-base font-medium">{q}</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{opts.map((o, n) => {
      const cls = pick === null ? "" : n === correct ? "!border-green-500 !bg-green-500/15" : n === pick ? "!border-red-500 !bg-red-500/15" : "opacity-50";
      return <Btn key={n} onClick={() => choose(n)} className={`text-left ${cls}`}>{o}</Btn>;
    })}</div>
    {pick !== null && <Btn className="mt-3" onClick={() => { setI((n) => n + 1); setPick(null); }}>{i + 1 === round.length ? "See score" : "Next →"}</Btn>}
  </div>;
}

export function GuessNumber({ setNotice }) {
  const MAX = 7;
  const [secret, setSecret] = useState(() => 1 + Math.floor(Math.random() * 100));
  const [val, setVal] = useState("");
  const [tries, setTries] = useState([]);
  const [over, setOver] = useState(false);
  const submit = () => {
    const n = Number(val);
    if (over || !Number.isInteger(n) || n < 1 || n > 100) { setNotice("Enter a whole number from 1 to 100."); return; }
    const t = [...tries, n]; setTries(t); setVal("");
    if (n === secret) { setOver(true); setNotice(`You got it in ${t.length}! 🎉 Number was ${secret}.`); }
    else if (t.length >= MAX) { setOver(true); setNotice(`Out of tries 😏 It was ${secret}.`); }
    else setNotice(n < secret ? "Higher ⬆️" : "Lower ⬇️");
  };
  const reset = () => { setSecret(1 + Math.floor(Math.random() * 100)); setTries([]); setOver(false); setVal(""); setNotice("New number locked in. Guess 1–100!"); };
  return <div className="text-center">
    <p className="text-sm text-white/70">I'm thinking of a number between <b>1</b> and <b>100</b>. You have {MAX} tries.</p>
    <div className="my-3 flex flex-wrap justify-center gap-2">{tries.map((t, i) => <span key={i} className="rounded-lg border border-white/15 px-3 py-1 text-sm">{t} {t === secret ? "✅" : t < secret ? "⬆️" : "⬇️"}</span>)}</div>
    <div className="mx-auto flex max-w-xs gap-2">
      <input type="number" inputMode="numeric" min="1" max="100" value={val} disabled={over} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Your guess" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black px-3 py-2 text-center text-sm outline-none focus:border-white/40" />
      <Btn disabled={over} onClick={submit}>Guess</Btn>
    </div>
    <p className="mt-2 text-xs text-white/50">Tries left: {MAX - tries.length}</p>
    {over && <Btn className="mt-2" onClick={reset}>Play again</Btn>}
  </div>;
}

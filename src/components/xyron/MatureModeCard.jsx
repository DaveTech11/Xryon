import React, { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../lib/AuthContext";

// Opt-in "Mature mode" for adults. The switch only asks; the server decides (it checks the age against the date of birth
// on the account, or the one entered here, and stores the setting on the user). Nothing here can turn it on by itself.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const selectCls = "rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm text-neutral-200 outline-none focus:border-white/25";

export default function MatureModeCard({ Toggle, GlassCard }) {
  const { user, checkUserAuth } = useAuth();
  const on = user?.matureMode?.on === true;
  const hasBirthdate = Boolean(user?.birthdate);
  const [asking, setAsking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dob, setDob] = useState({ m: "", d: "", y: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const call = async (payload) => {
    setBusy(true); setError("");
    try {
      await api.functions.invoke("matureMode", payload);
      await checkUserAuth?.();
      return true;
    } catch (e) {
      setError(e?.message || "Could not change this setting. Try again.");
      return false;
    } finally { setBusy(false); }
  };

  const turnOff = async () => { setAsking(false); await call({ enabled: false }); };
  const submit = async () => {
    if (!confirm) { setError("Tick the box to confirm you are 18 or older."); return; }
    const payload = { enabled: true, confirm18: true };
    if (!hasBirthdate) {
      if (!dob.m || !dob.d || !dob.y) { setError("Choose your date of birth."); return; }
      Object.assign(payload, { birthMonth: Number(dob.m), birthDay: Number(dob.d), birthYear: Number(dob.y) });
    }
    if (await call(payload)) { setAsking(false); setConfirm(false); }
  };
  const thisYear = new Date().getFullYear();

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-neutral-200"><ShieldCheck className="h-4 w-4 text-neutral-400" /> Mature mode <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-300">18+</span></p>
          <p className="text-xs text-neutral-500">Straight answers with no lecturing, and room for dark, mature fiction. Still refuses anything that harms real people.</p>
        </div>
        {busy ? <Loader2 className="h-5 w-5 animate-spin text-neutral-400" /> : (
          <Toggle checked={on || asking} label="Mature mode" onChange={(v) => (v ? setAsking(true) : turnOff())} />
        )}
      </div>

      {asking && !on && (
        <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs leading-relaxed text-neutral-400">
            Mature mode is for adults. It allows frank talk, strong language and mature themes in fiction (violence, crime, grief, adult romance without graphic sex). It will not write sexual content involving minors or real people, or help harm, harass or deceive anyone.
          </p>
          {!hasBirthdate && (
            <div className="flex flex-wrap gap-2">
              <select aria-label="Birth month" className={selectCls} value={dob.m} onChange={(e) => setDob({ ...dob, m: e.target.value })}>
                <option value="">Month</option>{MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
              </select>
              <select aria-label="Birth day" className={selectCls} value={dob.d} onChange={(e) => setDob({ ...dob, d: e.target.value })}>
                <option value="">Day</option>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
              </select>
              <select aria-label="Birth year" className={selectCls} value={dob.y} onChange={(e) => setDob({ ...dob, y: e.target.value })}>
                <option value="">Year</option>{Array.from({ length: 100 }, (_, i) => thisYear - i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-neutral-200">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-500" />
            <span>I am 18 or older and I want to turn on Mature mode.</span>
          </label>
          {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={submit} disabled={busy} className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black transition hover:bg-neutral-200 disabled:opacity-50">Turn on</button>
            <button type="button" onClick={() => { setAsking(false); setError(""); }} className="rounded-full px-4 py-1.5 text-sm text-neutral-400 transition hover:text-white">Cancel</button>
          </div>
        </div>
      )}
      {!asking && error && <p className="mt-2 text-xs text-red-300" role="alert">{error}</p>}
    </GlassCard>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Eye, EyeOff, Loader2, Search, ArrowLeft } from "lucide-react";
import { api } from "../api/client";
import { Checkbox } from "./ui/checkbox";
import AuthLayout from "./AuthLayout";
import { COUNTRIES, guessCountry, flagUrl } from "../lib/countries";
import { safeReturnTo } from "../lib/authReturnTo";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pill = "h-12 w-full rounded-full border border-white/15 bg-black px-5 text-white placeholder:text-neutral-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/60";
const primaryBtn = "flex h-12 w-full items-center justify-center rounded-full bg-[#f8f8f8] text-base font-medium text-[#1f1f1f] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50";

function Flag({ iso }) {
  const [bad, setBad] = useState(false);
  if (bad) return <span className="grid h-4 w-6 place-items-center rounded-sm bg-white/10 text-[9px] font-semibold text-neutral-300">{iso}</span>;
  return <img src={flagUrl(iso)} alt="" width={24} height={16} className="h-4 w-6 rounded-sm object-cover" onError={() => setBad(true)} />;
}

function FieldError({ children }) {
  if (!children) return null;
  return <p role="alert" className="mt-1.5 pl-4 text-xs text-red-400">{children}</p>;
}

function CountryPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef(null);

  useEffect(() => {
    if (!open) return;
    const down = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^\+/, "");
    if (!t) return COUNTRIES;
    return COUNTRIES.filter((c) => c[1].toLowerCase().includes(t) || c[2].startsWith(t) || c[0].toLowerCase() === t);
  }, [q]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQ(""); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-12 w-full items-center gap-3 rounded-full border border-white/15 bg-black px-5 text-left text-white outline-none transition focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/60"
      >
        <Flag iso={value[0]} />
        <span className="flex-1 truncate">{value[1]} (+{value[2]})</span>
        <ChevronDown className={`h-4 w-4 text-neutral-300 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-2xl border border-white/15 bg-[#0b0b0b] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
            <Search className="h-4 w-4 text-neutral-500" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search country or code"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
            {list.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">No match</li>}
            {list.map((c) => (
              <li key={c[0] + c[2]}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c[0] === value[0] && c[2] === value[2]}
                  onClick={() => { onChange(c); setOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-neutral-200 hover:bg-white/10"
                >
                  <Flag iso={c[0]} />
                  <span className="flex-1 truncate">{c[1]}</span>
                  <span className="text-neutral-500">+{c[2]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete, autoFocus, invalid }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={invalid ? "true" : undefined}
        className={`${pill} pr-12 ${invalid ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/50" : ""}`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

const Select = ({ label, value, onChange, children }) => (
  <select
    aria-label={label}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="h-12 w-full appearance-none rounded-full border border-white/15 bg-black px-4 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/60"
  >
    {children}
  </select>
);

// Phone sign-up / sign-in. Flow:
//   phone number -> (account exists?  password -> signed in)
//                   (new?  password -> confirm password -> birthday + name -> Done -> signed in)
export default function PhoneAuth({ onBack }) {
  const [step, setStep] = useState("phone"); // phone | login | password | confirm | profile
  const [country, setCountry] = useState(guessCountry);
  const [national, setNational] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [year, setYear] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({}); // { phone, password, confirm, birth, first, last, form }
  const setErr = (k, v) => setErrors((e) => ({ ...e, [k]: v }));
  const clearErr = () => setErrors({});

  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  const phoneValid = digits.length >= 5 && country[2].length + digits.length >= 8 && country[2].length + digits.length <= 15;
  const shownPhone = `+${country[2]} ${national.trim()}`;
  const finish = () => { window.location.href = safeReturnTo(); };

  const thisYear = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: thisYear - 1899 }, (_, i) => thisYear - i), [thisYear]);
  const daysInMonth = month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31;
  useEffect(() => { if (day && Number(day) > daysInMonth) setDay(""); }, [daysInMonth, day]);

  const goBack = () => {
    clearErr();
    if (step === "phone") return onBack?.();
    if (step === "login" || step === "password") return setStep("phone");
    if (step === "confirm") return setStep("password");
    if (step === "profile") return setStep("confirm");
  };

  const handlePhone = async (e) => {
    e.preventDefault();
    if (!phoneValid || loading) return;
    clearErr();
    setLoading(true);
    try {
      const exists = await api.auth.phoneExists({ countryCode: country[2], phone: national });
      setPassword(""); setConfirm("");
      setStep(exists ? "login" : "password");
    } catch (err) {
      setErr("phone", err.message || "Could not check this number. Try again.");
    } finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password || loading) return;
    clearErr();
    setLoading(true);
    try {
      await api.auth.phoneLogin({ countryCode: country[2], phone: national, password });
      finish();
    } catch (err) {
      setErr("password", err.message || "Incorrect phone number or password.");
      setLoading(false);
    }
  };

  const handlePassword = (e) => {
    e.preventDefault();
    clearErr();
    if (password.length < 8) return setErr("password", "Password must be at least 8 characters.");
    setConfirm("");
    setStep("confirm");
  };

  const mismatch = confirm.length > 0 && confirm !== password;
  const handleConfirm = (e) => {
    e.preventDefault();
    clearErr();
    if (confirm !== password) return setErr("confirm", "Passwords do not match.");
    setStep("profile");
  };

  const profileReady = month && day && year && first.trim() && last.trim() && agreed && !loading;
  const handleDone = async (e) => {
    e.preventDefault();
    if (!profileReady) return;
    clearErr();
    setLoading(true);
    try {
      await api.auth.phoneSignup({
        countryCode: country[2], phone: national, password, confirmPassword: confirm,
        firstName: first.trim(), lastName: last.trim(),
        birthMonth: Number(month), birthDay: Number(day), birthYear: Number(year),
        acceptedTerms: agreed,
      });
      finish();
    } catch (err) {
      const f = err.field;
      if (f === "phone") { setStep("phone"); setErr("phone", err.message); }
      else if (f === "password") { setStep("password"); setErr("password", err.message); }
      else if (f === "confirmPassword") { setStep("confirm"); setErr("confirm", err.message); }
      else if (f === "birth") setErr("birth", err.message);
      else if (f === "firstName") setErr("first", err.message);
      else if (f === "lastName") setErr("last", err.message);
      else setErr("form", err.message || "Could not finish sign-up.");
      setLoading(false);
    }
  };

  const back = (
    <button type="button" onClick={goBack} className="mx-auto mt-5 flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
      <ArrowLeft className="h-3.5 w-3.5" /> {step === "phone" ? "Use email instead" : "Back"}
    </button>
  );
  const formError = errors.form && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{errors.form}</div>;
  const spin = (text) => (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{text}</>);

  // ---- phone number ----
  if (step === "phone") {
    return (
      <AuthLayout title="Continue with phone" subtitle="Enter your phone number to log in or create an account">
        <form onSubmit={handlePhone} className="space-y-3">
          <CountryPicker value={country} onChange={setCountry} />
          <div>
            <div className={`flex h-12 items-center rounded-full border bg-black px-5 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/60 ${errors.phone ? "border-red-500/70" : "border-white/15"}`}>
              <span className="mr-3 text-white">+{country[2]}</span>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                autoFocus
                maxLength={18}
                placeholder="Phone number"
                value={national}
                onChange={(e) => { setNational(e.target.value.replace(/[^\d\s\-()]/g, "")); setErr("phone", ""); }}
                className="h-full w-full bg-transparent text-white outline-none placeholder:text-neutral-500"
                aria-label="Phone number"
                aria-invalid={errors.phone ? "true" : undefined}
              />
            </div>
            <FieldError>{errors.phone}</FieldError>
          </div>
          <button type="submit" disabled={!phoneValid || loading} className={`${primaryBtn} mt-2`}>
            {loading ? spin("Checking...") : "Continue"}
          </button>
        </form>
        {back}
      </AuthLayout>
    );
  }

  // ---- existing account: password ----
  if (step === "login") {
    return (
      <AuthLayout title="Welcome back" subtitle={<>Enter the password for <span className="text-neutral-200">{shownPhone}</span></>}>
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <PasswordInput id="phone-login-password" value={password} onChange={(v) => { setPassword(v); setErr("password", ""); }} placeholder="Password" autoComplete="current-password" autoFocus invalid={Boolean(errors.password)} />
            <FieldError>{errors.password}</FieldError>
          </div>
          <button type="submit" disabled={!password || loading} className={`${primaryBtn} mt-2`}>
            {loading ? spin("Logging in...") : "Log in"}
          </button>
        </form>
        {back}
      </AuthLayout>
    );
  }

  // ---- new account: password ----
  if (step === "password") {
    return (
      <AuthLayout title="Create a password" subtitle={<>For <span className="text-neutral-200">{shownPhone}</span></>}>
        <form onSubmit={handlePassword} className="space-y-3">
          <div>
            <PasswordInput id="phone-new-password" value={password} onChange={(v) => { setPassword(v); setErr("password", ""); }} placeholder="Password" autoComplete="new-password" autoFocus invalid={Boolean(errors.password)} />
            {errors.password ? <FieldError>{errors.password}</FieldError> : <p className="mt-1.5 pl-4 text-xs text-neutral-500">At least 8 characters.</p>}
          </div>
          <button type="submit" disabled={password.length < 8} className={`${primaryBtn} mt-2`}>Continue</button>
        </form>
        {back}
      </AuthLayout>
    );
  }

  // ---- new account: confirm password ----
  if (step === "confirm") {
    const err = errors.confirm || (mismatch && confirm.length >= password.length ? "Passwords do not match." : "");
    return (
      <AuthLayout title="Confirm your password" subtitle="Type the same password again">
        <form onSubmit={handleConfirm} className="space-y-3">
          <div>
            <PasswordInput id="phone-confirm-password" value={confirm} onChange={(v) => { setConfirm(v); setErr("confirm", ""); }} placeholder="Confirm password" autoComplete="new-password" autoFocus invalid={Boolean(err)} />
            <FieldError>{err}</FieldError>
          </div>
          <button type="submit" disabled={!confirm} className={`${primaryBtn} mt-2`}>Continue</button>
        </form>
        {back}
      </AuthLayout>
    );
  }

  // ---- new account: birthday + name ----
  return (
    <AuthLayout title="Tell us about you" subtitle="Last step, then you're in" hideLegal>
      {formError}
      <form onSubmit={handleDone} className="space-y-5">
        <div>
          <p className="mb-2 pl-4 text-sm text-neutral-300">Date of birth</p>
          <div className="grid grid-cols-[1.5fr_1fr_1.2fr] gap-2">
            <Select label="Month" value={month} onChange={(v) => { setMonth(v); setErr("birth", ""); }}>
              <option value="" disabled>Month</option>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select label="Day" value={day} onChange={(v) => { setDay(v); setErr("birth", ""); }}>
              <option value="" disabled>Day</option>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Select label="Year" value={year} onChange={(v) => { setYear(v); setErr("birth", ""); }}>
              <option value="" disabled>Year</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <FieldError>{errors.birth}</FieldError>
        </div>

        <div className="space-y-3">
          <div>
            <input value={first} onChange={(e) => { setFirst(e.target.value); setErr("first", ""); }} maxLength={30} autoComplete="given-name" placeholder="First name" aria-label="First name" className={pill} />
            <FieldError>{errors.first}</FieldError>
          </div>
          <div>
            <input value={last} onChange={(e) => { setLast(e.target.value); setErr("last", ""); }} maxLength={30} autoComplete="family-name" placeholder="Last name" aria-label="Last name" className={pill} />
            <FieldError>{errors.last}</FieldError>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <Checkbox
            id="phone-terms"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
            className="mt-0.5 h-[18px] w-[18px] rounded-[5px] border-white/30 bg-black data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white"
          />
          <label htmlFor="phone-terms" className="cursor-pointer text-xs leading-5 text-neutral-400">
            By signing up you agree to the{" "}
            <Link to="/terms" target="_blank" className="text-blue-400 underline underline-offset-2" onClick={(e) => e.stopPropagation()}>Terms and Conditions</Link>
          </label>
        </div>

        <button type="submit" disabled={!profileReady} className="flex h-12 w-full items-center justify-center rounded-full bg-blue-600 font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
          {loading ? spin("Finishing...") : "Done"}
        </button>
      </form>
      {back}
    </AuthLayout>
  );
}

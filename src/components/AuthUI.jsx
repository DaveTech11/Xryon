import React, { useState } from "react";
import { Eye, EyeOff, XCircle } from "lucide-react";
import GoogleIcon from "./GoogleIcon";

// Shared auth controls. Each one switches style at the lg breakpoint:
// dark pill fields + blue gradient button on phones, light fields + white button on laptops.

export function AuthField({ id, label, icon: Icon, type = "text", value, onChange, placeholder, autoComplete, autoFocus, required, clearable }) {
  const isPassword = type === "password";
  const [show, setShow] = useState(false);
  return (
    <div className="mb-4 min-[420px]:mb-5 lg:mb-3.5">
      {label && <label htmlFor={id} className="mb-2 block text-sm text-white min-[420px]:text-[15px] lg:hidden">{label}</label>}
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400 lg:hidden" aria-hidden="true" />}
        <input
          id={id}
          type={isPassword && show ? "text" : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          className={`h-[50px] w-full rounded-full bg-[#151a21] text-[14px] text-white min-[420px]:h-[56px] min-[420px]:text-[15px] outline-none placeholder:text-neutral-500 focus:ring-1 focus:ring-blue-500/70 ${Icon ? "pl-12 min-[420px]:pl-14" : "pl-5"} pr-12 lg:h-12 lg:rounded-lg lg:bg-[#e8eefc] lg:pl-4 lg:pr-11 lg:text-[#161d2e] lg:placeholder:text-[#5f6a80] lg:focus:ring-2 lg:focus:ring-blue-400/60`}
        />
        {isPassword ? (
          <button type="button" tabIndex={-1} onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 lg:text-[#5f6a80]">
            {show ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </button>
        ) : clearable && value ? (
          <button type="button" tabIndex={-1} onClick={() => onChange({ target: { value: "" } })} aria-label="Clear" className="absolute right-4 top-1/2 hidden -translate-y-1/2 text-[#5f6a80] lg:block">
            <XCircle className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RememberRow({ checked, onChange, forgotTo, Link }) {
  return (
    <div className="mb-5 flex items-center justify-between text-[13px] text-white min-[420px]:mb-7 min-[420px]:text-[14px] lg:mb-6">
      <label className="flex cursor-pointer items-center">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="grid h-[22px] w-[22px] place-items-center rounded-md border border-white/20 bg-[#151a21] peer-checked:border-blue-500 peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400">
          {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>}
        </span>
        <span className="ml-3">Remember me</span>
      </label>
      <Link to={forgotTo} className="hover:underline lg:text-[12px] lg:text-neutral-300">
        <span className="lg:hidden">Forget password?</span>
        <span className="hidden lg:inline">Recover Password ?</span>
      </Link>
    </div>
  );
}

export function AuthButton({ children, loading, disabled, type = "submit", onClick }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className="flex h-[50px] w-full items-center justify-center rounded-full bg-gradient-to-b from-[#3d5cf2] to-[#3a8bff] text-[15px] font-semibold text-white min-[420px]:h-[56px] min-[420px]:text-base shadow-[0_8px_30px_-8px_rgba(59,100,255,.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 lg:h-[50px] lg:rounded-lg lg:bg-white lg:bg-none lg:text-[15px] lg:tracking-wide lg:text-black lg:shadow-[0_0_30px_-6px_rgba(120,140,255,.5)]">
      {children}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center text-[13px] text-white min-[420px]:my-8 min-[420px]:text-[14px] lg:my-7 lg:text-[11px] lg:text-neutral-300">
      <span className="h-px flex-1 bg-white/15 lg:bg-white/30" /><span className="mx-4">Or continue with</span><span className="h-px flex-1 bg-white/15 lg:bg-white/30" />
    </div>
  );
}

const FbIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1877f2" /><path d="M16.6 15.5l.5-3.3h-3.2v-2.1c0-.9.4-1.8 1.9-1.8h1.4V5.4s-1.3-.2-2.5-.2c-2.6 0-4.3 1.6-4.3 4.4v2.6H7.5v3.3h2.9V24h3.5v-8.5Z" fill="#fff" /></svg>
);
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 text-white lg:text-black" fill="currentColor" aria-hidden="true"><path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" /></svg>
);

export function SocialRow({ onGoogle, onApple, onFacebook }) {
  const btn = "mx-2 grid h-12 w-12 place-items-center rounded-full bg-[#161b22] min-[420px]:h-14 min-[420px]:w-14 ring-1 ring-white/5 transition hover:bg-[#1d242d] lg:mx-1.5 lg:h-12 lg:w-[96px] lg:rounded-md lg:bg-[#f3f3f3] lg:ring-0 lg:hover:bg-white";
  return (
    <div className="flex items-center justify-center">
      <button type="button" onClick={onGoogle} className={btn} aria-label="Continue with Google"><GoogleIcon className="h-6 w-6" /></button>
      <button type="button" onClick={onApple} className={btn} aria-label="Continue with Apple"><AppleIcon /></button>
      <button type="button" onClick={onFacebook} className={btn} aria-label="Continue with Facebook"><FbIcon /></button>
    </div>
  );
}

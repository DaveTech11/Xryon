import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Checkbox } from "../components/ui/checkbox";
import { Mail, Loader2, Check } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import { AuthField, AuthButton, OrDivider, SocialRow } from "../components/AuthUI";
import PhoneAuth from "../components/PhoneAuth";
import { toast } from "../components/ui/use-toast";
import { safeReturnTo } from "../lib/authReturnTo";

const RESEND_SECONDS = 60;

// Sign-up (and code sign-in for existing accounts) in three steps:
//   email -> 6-digit code -> name + terms -> signed in.
export default function Register() {
  const [step, setStep] = useState("email"); // "email" | "code" | "name"
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("oauth_error") || "");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [phoneMode, setPhoneMode] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const finish = () => { window.location.href = safeReturnTo(); };

  const handleSendCode = async (e) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.sendCode(email.trim());
      setOtpCode("");
      setCooldown(RESEND_SECONDS);
      setStep("code");
    } catch (err) {
      setError(err.message || "Could not send the code");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError("");
    try {
      await api.auth.sendCode(email.trim());
      setOtpCode("");
      setCooldown(RESEND_SECONDS);
      toast({ title: "Code sent", description: "Check your email for the new code." });
    } catch (err) {
      setError(err.message || "Failed to resend code");
    }
  };

  const handleContinue = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.auth.verifyCode(email.trim(), otpCode);
      if (result.user) return finish(); // existing account: signed in
      setSignupToken(result.signupToken);
      setStep("name");
    } catch (err) {
      setError(err.message || "Invalid verification code");
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  const nameValid = name.trim().length >= 2;
  const canFinish = nameValid && agreed && !loading;

  const handleDone = async (e) => {
    e.preventDefault();
    if (!canFinish) return;
    setError("");
    setLoading(true);
    try {
      await api.auth.completeSignup({ signupToken, name: name.trim(), acceptedTerms: agreed });
      finish();
    } catch (err) {
      setError(err.message || "Could not finish sign-up");
      setLoading(false);
    }
  };

  const errorBox = error && (
    <div className="mb-4 break-words rounded-lg border border-white/25 bg-white/10 p-3 text-sm text-white">{error}</div>
  );

  if (phoneMode) return <PhoneAuth onBack={() => setPhoneMode(false)} />;

  // ---- Step 3: name + terms ----
  if (step === "name") {
    return (
      <AuthLayout title="What's your name?" subtitle="Last step, then you're in">
        {errorBox}
        <form onSubmit={handleDone} className="space-y-5">
          <div className="relative">
            <Input
              id="name"
              autoFocus
              autoComplete="name"
              maxLength={40}
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-full border-white/15 bg-black pl-5 pr-12 text-white placeholder:text-neutral-500 focus-visible:ring-white/60"
            />
            {nameValid && (
              <span className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-white" aria-label="Name looks good">
                <Check className="h-4 w-4 text-black" strokeWidth={3} />
              </span>
            )}
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="terms"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              className="mt-0.5 h-[18px] w-[18px] rounded-[5px] border-white/30 bg-black data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
            />
            <label htmlFor="terms" className="cursor-pointer text-xs leading-5 text-neutral-400">
              By signing up you agree to the{" "}
              <Link to="/terms" target="_blank" className="text-white underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                Terms and Conditions
              </Link>
            </label>
          </div>

          <Button
            type="submit"
            disabled={!canFinish}
            className="h-12 w-full rounded-full bg-white font-medium text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finishing...</>) : "Done"}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  // ---- Step 2: code ----
  if (step === "code") {
    const codeReady = otpCode.length === 6 && !loading;
    return (
      <AuthLayout
        hideLegal
        title="Check your inbox"
        subtitle={
          <>
            Enter the verification code we just sent to
            <br />
            <span className="break-all text-neutral-300">{email}</span>
          </>
        }
      >
        {errorBox}
        <form onSubmit={(e) => { e.preventDefault(); if (codeReady) handleContinue(); }}>
          {/* pill input with the label sitting in the border (native <legend> notch) */}
          <fieldset className="rounded-full border border-[#7d8cff] px-5 pb-2.5 pt-0 transition focus-within:border-[#9aa6ff]">
            <legend className="ml-1 px-1.5 text-[13px] leading-none text-[#8f9bff]">Code</legend>
            <input
              id="code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              aria-label="Verification code"
              className="h-9 w-full bg-transparent text-[17px] tracking-[0.18em] text-white caret-white outline-none"
            />
          </fieldset>

          <button
            type="submit"
            disabled={!codeReady}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-full bg-[#f8f8f8] text-base font-medium text-[#1f1f1f] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking...</>) : "Continue"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0}
            className="text-[15px] font-semibold text-neutral-100 hover:underline disabled:cursor-not-allowed disabled:font-medium disabled:text-neutral-500 disabled:no-underline"
          >
            {cooldown > 0 ? `Resend email in ${cooldown}s` : "Resend email"}
          </button>
          <div className="mt-2">
            <button type="button" onClick={() => { setStep("email"); setError(""); }} className="text-xs text-neutral-500 hover:text-neutral-300 hover:underline">
              Use a different email
            </button>
          </div>
        </div>

        <p className="mt-9 text-center text-[15px] text-neutral-300">
          <Link to="/terms" className="underline underline-offset-2 hover:text-white">Terms of Use</Link>
          <span className="mx-3 text-neutral-500">|</span>
          <Link to="/privacy" className="underline underline-offset-2 hover:text-white">Privacy Policy</Link>
        </p>
      </AuthLayout>
    );
  }

  // ---- Step 1: email ----
  const returnQs = safeReturnTo() !== "/" ? "?returnTo=" + encodeURIComponent(safeReturnTo()) : "";
  return (
    <AuthLayout
      title={"Create Your Xyron\nAccount Today"}
      desktopTitle={"Create\nAccount"}
      subtitle="Enter your email and we'll send you a code"
      footer={<>Already have an account?{" "}<Link to={"/login" + returnQs}>Log in</Link></>}
    >
      {errorBox}
      <form onSubmit={handleSendCode}>
        <AuthField id="email" label="Email" icon={Mail} type="email" autoComplete="email" autoFocus placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required clearable />
        <AuthButton loading={loading}>{loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending code...</>) : "Send code"}</AuthButton>
      </form>

      <OrDivider />
      <SocialRow
        onGoogle={() => api.auth.loginWithProvider("google", safeReturnTo())}
        onApple={() => toast({ title: "Apple sign-in is coming soon", description: "Use Google, phone or email for now." })}
        onFacebook={() => toast({ title: "Facebook sign-in is coming soon", description: "Use Google, phone or email for now." })}
      />
      <div className="mt-6 text-center text-sm text-neutral-400">
        <button type="button" onClick={() => setPhoneMode(true)} className="hover:text-white hover:underline">Continue with phone number</button>
      </div>
    </AuthLayout>
  );
}

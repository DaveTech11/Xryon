import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import { AuthField, AuthButton, OrDivider, RememberRow, SocialRow } from "../components/AuthUI";
import PhoneAuth from "../components/PhoneAuth";
import { toast } from "../components/ui/use-toast";
import { safeReturnTo } from "../lib/authReturnTo";

const REMEMBER_KEY = "xyron_remember_email";
const readRemembered = () => { try { return localStorage.getItem(REMEMBER_KEY) || ""; } catch { return ""; } };

export default function Login() {
  const remembered = readRemembered();
  const [email, setEmail] = useState(remembered);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(remembered));
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get("oauth_error") || "");
  const [loading, setLoading] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();
  const registerTo = "/register" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.loginViaEmailPassword(email, password);
      try { remember ? localStorage.setItem(REMEMBER_KEY, email.trim()) : localStorage.removeItem(REMEMBER_KEY); } catch { /* storage blocked */ }
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const soon = (name) => toast({ title: `${name} sign-in is coming soon`, description: "Use Google, phone or email for now." });

  if (phoneMode) return <PhoneAuth onBack={() => setPhoneMode(false)} />;

  return (
    <AuthLayout
      title={"Access Your Xyron\nAccount Now"}
      desktopTitle={"Hello !\nWelcome Back"}
      footer={<>Don't have an account?{" "}<Link to={registerTo}>Create an account</Link></>}
    >
      {error && <div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <form onSubmit={handleSubmit}>
        <AuthField id="email" label="Email" icon={Mail} type="email" autoComplete="email" autoFocus placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} required clearable />
        <AuthField id="password" label="Password" icon={Lock} type="password" autoComplete="current-password" placeholder="Enter your Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <RememberRow checked={remember} onChange={setRemember} forgotTo="/forgot-password" Link={Link} />
        <AuthButton loading={loading}>{loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Logging in...</>) : "Login"}</AuthButton>
      </form>

      <OrDivider />
      <SocialRow onGoogle={() => api.auth.loginWithProvider("google", returnTo)} onApple={() => soon("Apple")} onFacebook={() => soon("Facebook")} />

      <div className="mt-6 flex flex-col items-center gap-2 text-sm text-neutral-400">
        <button type="button" onClick={() => setPhoneMode(true)} className="hover:text-white hover:underline">Continue with phone number</button>
        <Link to={registerTo} className="hover:text-white hover:underline">Sign in with an email code instead</Link>
      </div>
    </AuthLayout>
  );
}

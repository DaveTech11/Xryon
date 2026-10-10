import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trash2, Sparkles, Camera, User, AlertTriangle, Search, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { api } from "../api/client";
import { useAuth } from "../lib/AuthContext";
import { getSetting, setSetting } from "../lib/settings";
import SettingsNav, { SETTINGS_NAV } from "../components/xyron/SettingsNav";
import UsagePanel from "../components/xyron/UsagePanel";
import AccountPanel from "../components/xyron/AccountPanel";

const FONT_SIZES = [
  { key: "sm", label: "Small" },
  { key: "md", label: "Medium" },
  { key: "lg", label: "Large" },
];

const PERSONA_OPTIONS = [
  { key: "concise", label: "Concise" },
  { key: "detailed", label: "Detailed" },
  { key: "creative", label: "Creative" },
  { key: "professional", label: "Professional" },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-blue-500" : "bg-neutral-700"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function GlassCard({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeNav, setActiveNav] = useState(() => {
    const tab = searchParams.get("tab");
    return tab && SETTINGS_NAV.some((n) => n.key === tab) ? tab : "general";
  });
  const [fontSize, setFontSize] = useState(getSetting("fontSize", "md"));
  const [persona, setPersona] = useState(getSetting("persona", "concise"));
  const [systemPrompt, setSystemPrompt] = useState(getSetting("systemPrompt", ""));
  const [darkMode, setDarkMode] = useState(getSetting("darkMode", "dark") === "dark");
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [user, setUser] = useState(null);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [search, setSearch] = useState("");
  const [notifEmail, setNotifEmail] = useState(getSetting("notifEmail", "on") === "on");
  const [notifPush, setNotifPush] = useState(getSetting("notifPush", "off") === "on");
  const [voiceSpeed, setVoiceSpeed] = useState(getSetting("voiceSpeed", "normal"));
  const [autoFix, setAutoFix] = useState(getSetting("autoFix", "on") === "on");
  const [trustedContact, setTrustedContact] = useState(getSetting("trustedContact", ""));

  useEffect(() => {
    api.auth.isAuthenticated().then((authed) => {
      if (authed) api.auth.me().then(setUser).catch(() => {});
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const saveFontSize = (val) => { setFontSize(val); setSetting("fontSize", val); };
  const savePersona = (val) => { setPersona(val); setSetting("persona", val); };
  const saveSystemPrompt = (val) => { setSystemPrompt(val); setSetting("systemPrompt", val); };
  const saveDarkMode = (val) => { setDarkMode(val); setSetting("darkMode", val ? "dark" : "light"); };

  const uploadProfilePic = async (file) => {
    setUploadingPic(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      await api.auth.updateMe({ profile_pic_url: file_url });
      setUser((prev) => ({ ...prev, profile_pic_url: file_url }));
    } catch (e) { console.error(e); }
    setUploadingPic(false);
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      const convos = await api.entities.Conversation.list("-created_date", 100);
      for (const c of convos) {
        await api.entities.Message.deleteMany({ conversation_id: c.id });
      }
      await api.entities.Conversation.deleteMany({});
      setCleared(true);
    } catch (e) { console.error(e); }
    setClearing(false);
  };

  const deleteAccount = async () => {
    setDeleting(true); setDeleteError("");
    try {
      await api.auth.deleteAccount();
      await logout(); // clears the in-memory session exactly like the Log out button
      setDeleted(true);
      setTimeout(() => navigate("/login", { replace: true }), 1000);
    } catch (e) {
      setDeleteError(e.message || "Couldn't delete your account. Please try again.");
    }
    setDeleting(false);
  };

  const currentLabel = SETTINGS_NAV.find((n) => n.key === activeNav)?.label || "Settings";

  return (
    <div className="min-h-screen bg-[#08080a] text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-10">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to chat
        </Link>

        <div className="flex flex-col gap-6 md:flex-row">
          {/* Glass sidebar nav */}
          <div className="w-full shrink-0 md:w-60">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur-xl">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search settings"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs text-neutral-200 outline-none placeholder:text-neutral-600"
                />
              </div>
              <div className="max-h-[60vh] space-y-0.5 overflow-y-auto sidebar-scroll md:max-h-[70vh]">
                <SettingsNav activeNav={activeNav} onSelect={setActiveNav} search={search} />
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="min-w-0 flex-1">
            <h1 className="mb-6 text-2xl font-bold tracking-tight">{currentLabel}</h1>

            {activeNav === "general" && (
              <div className="space-y-4">
                {user ? (
                  <GlassCard>
                    <div className="flex items-center gap-4">
                      {user.profile_pic_url ? (
                        <img src={user.profile_pic_url} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                      ) : (
                        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
                          <User className="h-6 w-6 text-neutral-400" />
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{user.full_name || "User"}</p>
                        <p className="text-xs text-neutral-500">{user.email}</p>
                      </div>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadProfilePic(file);
                            e.target.value = "";
                          }}
                        />
                        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-neutral-300 transition-colors hover:bg-white/5">
                          <Camera className="h-3.5 w-3.5" />
                          {uploadingPic ? "Uploading…" : "Change photo"}
                        </div>
                      </label>
                    </div>
                  </GlassCard>
                ) : (
                  <GlassCard>
                    <p className="text-sm text-neutral-400">You're using Xyron as a guest.</p>
                    <Link to="/login" className="mt-3 inline-block text-sm text-violet-300 hover:text-violet-200">
                      Sign in or create an account →
                    </Link>
                  </GlassCard>
                )}
                <Link to="/premium">
                  <div className="flex items-center gap-4 rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 p-5 transition-colors hover:from-violet-500/15 hover:to-fuchsia-500/15">
                    <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500/20">
                      <Sparkles className="h-5 w-5 text-violet-300" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">Upgrade to Premium</p>
                      <p className="text-xs text-neutral-400">From $3.99/month — unlimited messages & image generation</p>
                    </div>
                  </div>
                </Link>
              </div>
            )}

            {activeNav === "notifications" && (
              <div className="space-y-4">
                <GlassCard>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-neutral-200">Email notifications</p>
                      <p className="text-xs text-neutral-500">Receive updates about your account.</p>
                    </div>
                    <Toggle checked={notifEmail} onChange={(v) => { setNotifEmail(v); setSetting("notifEmail", v ? "on" : "off"); }} />
                  </div>
                </GlassCard>
                <GlassCard>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-neutral-200">Push notifications</p>
                      <p className="text-xs text-neutral-500">Get notified on your device.</p>
                    </div>
                    <Toggle checked={notifPush} onChange={(v) => { setNotifPush(v); setSetting("notifPush", v ? "on" : "off"); }} />
                  </div>
                </GlassCard>
              </div>
            )}

            {activeNav === "personalization" && (
              <div className="space-y-4">
                <GlassCard>
                  <p className="mb-3 text-sm text-neutral-400">Message text size</p>
                  <div className="flex gap-2">
                    {FONT_SIZES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => saveFontSize(s.key)}
                        className={`flex-1 rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                          fontSize === s.key ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-neutral-400 hover:bg-white/5"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </GlassCard>
                <GlassCard>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-neutral-200">Dark mode</p>
                      <p className="text-xs text-neutral-500">Toggle between dark and light appearance.</p>
                    </div>
                    <Toggle checked={darkMode} onChange={saveDarkMode} />
                  </div>
                </GlassCard>
                <GlassCard>
                  <p className="mb-3 text-sm text-neutral-400">Response style</p>
                  <div className="flex flex-wrap gap-2">
                    {PERSONA_OPTIONS.map((p) => (
                      <button
                        key={p.key}
                        onClick={() => savePersona(p.key)}
                        className={`rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                          persona === p.key ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-neutral-400 hover:bg-white/5"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </GlassCard>
                <GlassCard>
                  <p className="mb-1 text-sm text-neutral-200">Custom instructions</p>
                  <p className="mb-3 text-xs text-neutral-500">Tell the AI how you'd like it to respond. Applied to every new message.</p>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => saveSystemPrompt(e.target.value)}
                    placeholder="e.g. Always answer in bullet points and avoid jargon…"
                    className="min-h-[100px] rounded-xl border-white/10 bg-white/5 text-sm text-neutral-200 placeholder:text-neutral-600"
                  />
                </GlassCard>
              </div>
            )}

            {activeNav === "voice" && (
              <div className="space-y-4">
                <GlassCard>
                  <p className="mb-3 text-sm text-neutral-400">Voice speed</p>
                  <div className="flex gap-2">
                    {["slow", "normal", "fast"].map((s) => (
                      <button
                        key={s}
                        onClick={() => { setVoiceSpeed(s); setSetting("voiceSpeed", s); }}
                        className={`flex-1 rounded-xl border px-4 py-2.5 text-sm capitalize transition-colors ${
                          voiceSpeed === s ? "border-white/25 bg-white/10 text-white" : "border-white/10 text-neutral-400 hover:bg-white/5"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </GlassCard>
                <GlassCard>
                  <p className="text-xs text-neutral-600">Voice-to-text is available on premium subscriptions. Use the mic button in the chat composer to dictate messages.</p>
                </GlassCard>
              </div>
            )}

            {activeNav === "billing" && (
              <GlassCard>
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-violet-300" />
                  <div className="flex-1">
                    <p className="text-sm text-neutral-200">Manage your subscription</p>
                    <p className="text-xs text-neutral-500">View plans, update payment methods, and manage billing.</p>
                  </div>
                </div>
                <Link to="/premium" className="mt-4 block rounded-xl bg-white px-4 py-2.5 text-center text-sm font-medium text-neutral-900 hover:bg-neutral-200">
                  View plans
                </Link>
              </GlassCard>
            )}

            {activeNav === "usage" && <UsagePanel />}

            {activeNav === "data" && (
              <div className="space-y-3">
                <GlassCard>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-neutral-200">Clear all conversations</p>
                      <p className="text-xs text-neutral-500">Permanently delete every chat and message.</p>
                    </div>
                    <Button variant="destructive" onClick={clearAll} disabled={clearing} className="rounded-xl bg-red-500/90 hover:bg-red-500">
                      {clearing ? "Clearing…" : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                  {cleared && <p className="mt-3 text-sm text-green-400">All conversations deleted.</p>}
                </GlassCard>
                <GlassCard>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-neutral-200">Auto-fix errors</p>
                      <p className="text-xs text-neutral-500">Vortyx Pulse automatically fixes code errors in Codex.</p>
                    </div>
                    <Toggle checked={autoFix} onChange={(v) => { setAutoFix(v); setSetting("autoFix", v ? "on" : "off"); }} />
                  </div>
                </GlassCard>
              </div>
            )}

            {activeNav === "security" && (
              <div className="space-y-4">
                <GlassCard>
                  <p className="text-sm text-neutral-200">Account security</p>
                  <p className="mt-1 text-xs text-neutral-500">Manage your password and login methods.</p>
                  {user ? (
                    <Link to="/forgot-password" className="mt-3 inline-block text-sm text-violet-300 hover:text-violet-200">
                      Reset password →
                    </Link>
                  ) : (
                    <Link to="/login" className="mt-3 inline-block text-sm text-violet-300 hover:text-violet-200">
                      Sign in →
                    </Link>
                  )}
                </GlassCard>
              </div>
            )}

            {activeNav === "trusted" && (
              <GlassCard>
                <p className="mb-3 text-sm text-neutral-400">Trusted contact</p>
                <p className="mb-3 text-xs text-neutral-500">Add a trusted email that can help recover your account.</p>
                <input
                  value={trustedContact}
                  onChange={(e) => { setTrustedContact(e.target.value); setSetting("trustedContact", e.target.value); }}
                  placeholder="trusted@email.com"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
                />
              </GlassCard>
            )}

            {activeNav === "account" && (
              <AccountPanel user={user} onUserChange={setUser} onDeleteAccount={deleteAccount} deleting={deleting} deleted={deleted} deleteError={deleteError} />
            )}

          </div>
        </div>
      </div>
    </div>
  );
}



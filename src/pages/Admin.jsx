import React, { useState, useEffect } from "react";
import { api } from "../api/client";
import { Menu, Users, MessageSquare, Code2, Star, Activity, Shield, AlertCircle, TrendingUp, Radio, Repeat, UserPlus, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from "recharts";
import Sidebar from "../components/xyron/Sidebar";
import { isAdminUser } from "../lib/adminEmails";
import BroadcastPanel from "../components/xyron/BroadcastPanel";
import AdminChatsPanel from "../components/xyron/AdminChatsPanel";
import PremiumPanel, { premiumBadge } from "../components/xyron/PremiumPanel";

function timeAgo(iso) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const USER_FILTERS = [
  { id: "all", label: "All" },
  { id: "online", label: "Online now" },
  { id: "today", label: "Active today" },
  { id: "returning", label: "Returning" },
  { id: "inactive", label: "Inactive 7d+" },
];

const CHART_COLORS = ["#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#3b82f6"];

function GlassCard({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

export default function Admin() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // "Grant" on a user row fills the email into the Premium panel.
  const [grantEmail, setGrantEmail] = useState("");
  const [grantTick, setGrantTick] = useState(0);
  const [userFilter, setUserFilter] = useState("all");

  useEffect(() => {
    api.auth.isAuthenticated().then((authed) => {
      if (authed) {
        api.auth.me().then((u) => {
          setUser(u);
          if (isAdminUser(u)) {
            loadStats(u.email);
          } else {
            setError("You are not authorized to view this page.");
            setLoading(false);
          }
        });
      } else {
        setError("Please sign in to access the admin dashboard.");
        setLoading(false);
      }
    });
  }, []);

  const loadStats = async (email) => {
    try {
      const res = await api.functions.invoke("adminStats", { email });
      setData(res.data);
    } catch (e) {
      setError(e.message || "Failed to load admin data.");
    }
    setLoading(false);
  };

  // Reload the numbers/users after a premium change, without the full-page spinner.
  const refresh = async () => {
    try { setData((await api.functions.invoke("adminStats", { email: user?.email })).data); } catch { /* keep what is on screen */ }
  };

  // Keep "online now" / "active today" fresh while the page is open.
  useEffect(() => {
    if (!user || !isAdminUser(user)) return undefined;
    const t = setInterval(() => { refresh(); }, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const startGrant = (email) => {
    setGrantEmail(email);
    setGrantTick((t) => t + 1);
    document.getElementById("premium-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const toggleBan = async (u) => {
    const name = u.email || u.phone || u.full_name || "this user";
    const ban = !u.banned;
    if (!window.confirm(ban ? `Ban ${name}? They are signed out right away and can't log back in.` : `Unban ${name}? They will be able to sign in again.`)) return;
    try { await api.premium.ban(u.id, ban); await refresh(); } catch (e) { window.alert(e.message || "Could not update this account."); }
  };

  const revokePremium = async (email) => {
    if (!window.confirm(`Remove Premium from ${email}?`)) return;
    try { await api.premium.revoke(email); await refresh(); }
    catch (e) { window.alert(e.message || "Could not remove Premium."); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08080a] text-neutral-100">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-h-screen items-center justify-center md:pl-72">
          <div className="w-8 h-8 border-4 border-neutral-700 border-t-neutral-300 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#08080a] text-neutral-100">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 md:pl-72">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10">
            <AlertCircle className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-sm text-neutral-400">{error}</p>
          <Link to="/" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200">
            Back to chat
          </Link>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const statCards = [
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-blue-400" },
    { label: "Conversations", value: stats.totalConversations, icon: MessageSquare, color: "text-emerald-400" },
    { label: "Messages", value: stats.totalMessages, icon: Activity, color: "text-violet-400" },
    { label: "Code Files", value: stats.totalCodeFiles, icon: Code2, color: "text-amber-400" },
    { label: "Feedback", value: stats.totalFeedback, icon: Star, color: "text-pink-400" },
  ];

  // Chart data
  const barData = [
    { name: "Users", value: stats.totalUsers || 0 },
    { name: "Convos", value: stats.totalConversations || 0 },
    { name: "Messages", value: stats.totalMessages || 0 },
    { name: "Code Files", value: stats.totalCodeFiles || 0 },
    { name: "Feedback", value: stats.totalFeedback || 0 },
  ];

  const pieData = [
    { name: "Conversations", value: stats.totalConversations || 0 },
    { name: "Messages", value: stats.totalMessages || 0 },
    { name: "Code Files", value: stats.totalCodeFiles || 0 },
    { name: "Feedback", value: stats.totalFeedback || 0 },
  ];

  const act = data?.activity?.summary || {};
  const actSeries = (data?.activity?.series || []).map((d) => ({ ...d, name: d.date.slice(5) }));
  const activityCards = [
    { label: "Online now", value: act.online ?? 0, icon: Radio, color: "text-emerald-400", hint: "last 5 min" },
    { label: "Active today", value: act.activeToday ?? 0, icon: Activity, color: "text-blue-400", hint: "opened the app" },
    { label: "Returning today", value: act.returningToday ?? 0, icon: Repeat, color: "text-violet-400", hint: "came back" },
    { label: "New today", value: act.newToday ?? 0, icon: UserPlus, color: "text-amber-400", hint: "first day" },
    { label: "Active 7 days", value: act.active7 ?? 0, icon: Flame, color: "text-pink-400", hint: `${act.returning7 ?? 0} came back` },
  ];
  const filteredUsers = (data?.users || []).filter((u) => {
    const a = u.activity || {};
    if (userFilter === "online") return a.online;
    if (userFilter === "today") return a.activeToday;
    if (userFilter === "returning") return a.daysActive > 1 && (a.daysLast7 || 0) > 0;
    if (userFilter === "inactive") return !a.daysLast7;
    return true;
  }).sort((x, y) => String(y.activity?.lastSeenAt || "").localeCompare(String(x.activity?.lastSeenAt || "")));

  const areaData = (data?.users || []).map((u, i) => ({
    name: `U${i + 1}`,
    users: i + 1,
  }));

  return (
    <div className="min-h-screen bg-[#08080a] text-neutral-100">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="md:pl-72">
        <header className="flex items-center gap-3 border-b border-white/10 bg-white/[0.02] px-5 py-4 backdrop-blur-xl md:hidden">
          <button onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5 text-neutral-400" />
          </button>
          <span className="flex items-center gap-2 font-display tracking-tight">
            <Shield className="h-4 w-4 text-violet-400" /> Admin
          </span>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
          <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-violet-500/[0.04] via-transparent to-blue-500/[0.03]" />

          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-violet-500/20 backdrop-blur-xl">
              <Shield className="h-5 w-5 text-violet-300" />
            </div>
            <div>
              <h1 className="font-display text-xl tracking-tight md:text-2xl">Admin Dashboard</h1>
              <p className="text-xs text-neutral-500">System overview, charts, users & feedback</p>
            </div>
          </div>

          {/* Stat cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {statCards.map((s) => (
              <GlassCard key={s.label} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <p className="text-xl font-bold text-white md:text-2xl">{s.value}</p>
                <p className="text-xs text-neutral-500">{s.label}</p>
              </GlassCard>
            ))}
          </div>

          {/* Activity: who is online, who is active, who returns every day */}
          <div className="mb-2 flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-medium text-neutral-200">User activity</h2>
            <span className="text-[11px] text-neutral-600">updates every minute{act.trackedSince ? ` · tracking since ${new Date(act.trackedSince).toLocaleDateString()}` : ""}</span>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {activityCards.map((s) => (
              <GlassCard key={s.label} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                  <span className="text-[10px] text-neutral-600">{s.hint}</span>
                </div>
                <p className="text-xl font-bold text-white md:text-2xl">{s.value}</p>
                <p className="text-xs text-neutral-500">{s.label}</p>
              </GlassCard>
            ))}
          </div>
          <div className="mb-6">
            <GlassCard>
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                <h2 className="text-sm font-medium text-neutral-200">Daily visitors (last 14 days)</h2>
                <span className="flex items-center gap-1.5 text-[11px] text-neutral-500"><i className="inline-block h-2 w-2 rounded-sm bg-violet-500" /> Returning</span>
                <span className="flex items-center gap-1.5 text-[11px] text-neutral-500"><i className="inline-block h-2 w-2 rounded-sm bg-amber-500" /> New</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={actSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#525252" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "#a3a3a3" }}
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  />
                  <Bar dataKey="returning" name="Returning" stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="new" name="New" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>
          </div>

          {/* Charts */}
          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-400" />
                <h2 className="text-sm font-medium text-neutral-200">Overview</h2>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData}>
                  <XAxis dataKey="name" stroke="#525252" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#525252" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "#a3a3a3" }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>

            <GlassCard>
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-medium text-neutral-200">Distribution</h2>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1a1a1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </GlassCard>
          </div>

          <div className="mb-6">
            <GlassCard>
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                <h2 className="text-sm font-medium text-neutral-200">User Growth</h2>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={areaData}>
                  <defs>
                    <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="#525252" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#525252" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a1c", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={2} fill="url(#userGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </GlassCard>
          </div>

          <PremiumPanel users={data?.users || []} freePremium={data?.freePremium} prefillEmail={grantEmail} prefillTick={grantTick} onChanged={refresh} />

          <AdminChatsPanel />
          <BroadcastPanel />

          {/* Users table */}
          <div className="mb-6">
            <GlassCard className="p-0">
              <div className="border-b border-white/10 px-5 py-3">
                <h2 className="text-sm font-medium text-neutral-200">Users <span className="text-neutral-600">({filteredUsers.length})</span></h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {USER_FILTERS.map((f) => (
                    <button key={f.id} type="button" onClick={() => setUserFilter(f.id)} className={`rounded-full border px-3 py-1 text-[11px] ${userFilter === f.id ? "border-white/30 bg-white/15 text-white" : "border-white/10 bg-white/[0.03] text-neutral-400 hover:bg-white/10"}`}>{f.label}</button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {filteredUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs text-neutral-300">
                      {(u.full_name || u.email || u.phone || "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-neutral-200">{u.full_name || "Unknown"}</p>
                      <p className="truncate text-xs text-neutral-500">{u.email || u.phone}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-neutral-500">
                        <span className="flex items-center gap-1"><i className={`inline-block h-1.5 w-1.5 rounded-full ${u.activity?.online ? "bg-emerald-400" : "bg-neutral-600"}`} />{u.activity?.online ? "online" : `seen ${timeAgo(u.activity?.lastSeenAt)}`}</span>
                        {u.activity?.daysActive > 0 && <span>{u.activity.daysActive} day{u.activity.daysActive === 1 ? "" : "s"} active</span>}
                        {u.activity?.streak > 1 && <span className="text-amber-400">🔥 {u.activity.streak}-day streak</span>}
                      </p>
                    </div>
                    {u.premium && (
                      <span className="hidden rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300 sm:inline">{premiumBadge(u.premium)}</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${u.role === "admin" ? "bg-violet-500/20 text-violet-300" : "bg-white/5 text-neutral-400"}`}>
                      {u.role || "user"}
                    </span>
                    <button type="button" onClick={() => startGrant(u.email)} className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/20">
                      {u.premium ? "Change" : "Grant"}
                    </button>
                    {u.banned && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">banned</span>}
                    {u.role !== "admin" && u.id !== user?.id && (
                      <button type="button" onClick={() => toggleBan(u)} className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium ${u.banned ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20" : "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"}`}>
                        {u.banned ? "Unban" : "Ban"}
                      </button>
                    )}
                    {u.premium && (
                      <button type="button" onClick={() => revokePremium(u.email)} className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300 hover:bg-red-500/20">
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="px-5 py-8 text-center text-sm text-neutral-600">No users found.</p>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Feedback */}
          <GlassCard className="p-0">
            <div className="border-b border-white/10 px-5 py-3">
              <h2 className="text-sm font-medium text-neutral-200">Feedback Reports</h2>
            </div>
            <div className="divide-y divide-white/5">
              {data?.feedback?.map((f) => (
                <div key={f.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {f.type ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${f.type === "bug" ? "bg-red-500/15 text-red-300" : "bg-sky-500/15 text-sky-300"}`}>
                        {f.type === "bug" ? "Bug report" : "Feedback"}
                      </span>
                    ) : (
                      <>
                        <span className={`text-xs ${f.vote === "up" ? "text-green-400" : "text-red-400"}`}>
                          {f.vote === "up" ? "👍" : "👎"}
                        </span>
                        {f.rating != null && <span className="text-xs text-neutral-400">Rating: {f.rating}/5</span>}
                      </>
                    )}
                    {f.email && <span className="text-xs text-neutral-400">{f.name ? `${f.name} · ` : ""}{f.email}</span>}
                    <span className="ml-auto text-[10px] text-neutral-600">
                      {f.created_date ? new Date(f.created_date).toLocaleString() : "—"}
                    </span>
                  </div>
                  {f.message && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-neutral-200">{f.message}</p>}
                  {f.improvement && (
                    <p className="mt-1 text-xs text-neutral-400">"{f.improvement}"</p>
                  )}
                </div>
              ))}
              {(!data?.feedback || data.feedback.length === 0) && (
                <p className="px-5 py-8 text-center text-sm text-neutral-600">No feedback yet.</p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}



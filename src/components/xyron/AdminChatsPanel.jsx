import React, { useState } from "react";
import { MessageSquare, ArrowLeft, Search } from "lucide-react";
import { api } from "../../api/client";

// Admin-only, read-only view of every user's chats. Hidden until the admin chooses to open it.
export default function AdminChatsPanel() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  const [total, setTotal] = useState(0);
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (query = q) => {
    setLoading(true); setError("");
    try {
      const res = await api.functions.invoke("adminChats", { q: query });
      setList(res.data.conversations || []); setTotal(res.data.total || 0);
    } catch (e) { setError(e.message || "Could not load chats."); }
    setLoading(false);
  };

  const openChat = async (id) => {
    setLoading(true); setError("");
    try { setView((await api.functions.invoke("adminChats", { conversation_id: id })).data); }
    catch (e) { setError(e.message || "Could not open this chat."); }
    setLoading(false);
  };

  const toggle = () => { const next = !open; setOpen(next); if (next && !list) load(""); };

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-sky-400" />
          <h2 className="text-sm font-medium text-neutral-200">All user chats</h2>
        </div>
        <button onClick={toggle} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/5">
          {open ? "Hide" : "Show chats"}
        </button>
      </div>
      {open && (
        <div className="mt-4">
          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
          {view ? (
            <div>
              <button onClick={() => setView(null)} className="mb-3 flex items-center gap-1 text-xs text-neutral-400 hover:text-white">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to list
              </button>
              <p className="text-sm font-medium text-neutral-100">{view.conversation.title}</p>
              <p className="mb-3 text-xs text-neutral-500">{view.conversation.name ? `${view.conversation.name} · ` : ""}{view.conversation.email}</p>
              <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                {view.messages.map((m) => (
                  <div key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-white/10 text-white" : "bg-white/[0.04] text-neutral-300"}`}>
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">{m.role}{m.created_date ? ` · ${new Date(m.created_date).toLocaleString()}` : ""}</p>
                    <p className="whitespace-pre-wrap break-words">{m.content || (m.attachments ? "" : "(empty)")}</p>
                    {m.attachments > 0 && <p className="mt-1 text-xs text-neutral-500">[{m.attachments} attachment(s)]</p>}
                  </div>
                ))}
                {view.messages.length === 0 && <p className="text-xs text-neutral-500">No messages in this chat.</p>}
              </div>
            </div>
          ) : (
            <div>
              <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="mb-3 flex gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 px-3">
                  <Search className="h-3.5 w-3.5 text-neutral-500" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email, name or title"
                    className="w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-neutral-600" />
                </div>
                <button type="submit" className="rounded-xl bg-violet-500/80 px-3 text-xs text-white">Search</button>
              </form>
              {loading && <p className="text-xs text-neutral-500">Loading…</p>}
              {list && <p className="mb-2 text-xs text-neutral-500">{total} chat(s){total > list.length ? `, showing the newest ${list.length}` : ""}</p>}
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {(list || []).map((c) => (
                  <button key={c.id} onClick={() => openChat(c.id)} className="block w-full rounded-xl border border-white/5 px-3 py-2 text-left hover:bg-white/5">
                    <p className="truncate text-sm text-neutral-100">{c.title}</p>
                    <p className="truncate text-xs text-neutral-500">{c.email} · {c.messages} message(s){c.updated_date ? ` · ${new Date(c.updated_date).toLocaleDateString()}` : ""}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

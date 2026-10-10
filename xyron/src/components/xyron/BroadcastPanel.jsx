import React, { useCallback, useEffect, useState } from "react";
import { Megaphone, Send, Trash2, Loader2 } from "lucide-react";
import { api } from "../../api/client";

// Admin-only composer. The server enforces admin access; this just hides the UI.
export default function BroadcastPanel() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [items, setItems] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.broadcasts.list();
      setItems(r.broadcasts || []);
      setTotalUsers(r.totalUsers || 0);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    setError(""); setOk("");
    if (!message.trim()) return setError("Write a message first.");
    if (!window.confirm(`Send this to all ${totalUsers} users?`)) return;
    setSending(true);
    try {
      await api.broadcasts.send({ title: title.trim(), message: message.trim(), url: url.trim() });
      setTitle(""); setMessage(""); setUrl("");
      setOk("Broadcast sent. Users see it within about 30 seconds.");
      load();
    } catch (err) { setError(err.message || "Could not send"); }
    setSending(false);
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this broadcast? Users who haven't seen it yet won't get it.")) return;
    try { await api.broadcasts.remove(id); load(); } catch (e) { setError(e.message); }
  };

  const field = "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none focus:border-white/30";

  return (
    <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <Megaphone className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-medium text-neutral-200">Broadcast to all users</h2>
      </div>
      <form onSubmit={send} className="space-y-3 p-5">
        <input className={field} placeholder="Title (optional)" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <textarea className={`${field} min-h-[96px] resize-y`} placeholder="Message" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
          <p className="mt-1 text-right text-[10px] text-neutral-600">{message.length}/500</p>
        </div>
        <input className={field} placeholder='"More" button link (optional, e.g. /premium). Leave empty to open the app.' value={url} onChange={(e) => setUrl(e.target.value)} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {ok && <p className="text-xs text-emerald-400">{ok}</p>}
        <button type="submit" disabled={sending || !message.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-40">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send broadcast
        </button>
      </form>
      {items.length > 0 && (
        <div className="divide-y divide-white/5 border-t border-white/10">
          {items.slice(0, 8).map((b) => (
            <div key={b.id} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-200">{b.title}</p>
                <p className="line-clamp-2 text-xs text-neutral-500">{b.message}</p>
                <p className="mt-1 text-[10px] text-neutral-600">
                  {new Date(b.created_date).toLocaleString()} · seen by {b.seenBy}/{totalUsers}
                </p>
              </div>
              <button onClick={() => remove(b.id)} className="text-neutral-600 hover:text-red-400" aria-label="Delete broadcast">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

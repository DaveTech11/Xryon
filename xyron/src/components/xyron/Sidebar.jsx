import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  X,
  PanelLeftClose,
  MessageSquare,
  Code2,
  Sparkles,
  Swords,
  Crown,
  Shield,
  Plus,
  Brain,
  WandSparkles,
  History,
  MoreHorizontal,
  Trash2,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Download,
  Check,
} from "lucide-react";
import { api } from "../../api/client";
import Logo from "./Logo";
import ProfileDock from "./ProfileDock";
import { useAuth } from "../../lib/AuthContext";
import { isAdminUser } from "../../lib/adminEmails";
import CodexComingSoon from "./CodexComingSoon";

const links = [
  { to: "/", label: "Chat", icon: MessageSquare },
  { to: "/codex", label: "Codex", icon: Code2 },
  { to: "/artifacts", label: "Artifacts", icon: Sparkles },
  { to: "/studio", label: "AI Studio", icon: WandSparkles },
  { to: "/intelligence", label: "Xyron Brain", icon: Brain },
  { to: "/premium", label: "Premium", icon: Crown },
  { to: "/anime", label: "Anime", icon: Swords, tag: "New" },
];

function formatHistoryDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  if (date >= startToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (date >= startYesterday) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getConversationTitle(conversation) {
  const title = String(conversation?.title || "").trim();
  return title || "New conversation";
}

export default function Sidebar({
  conversations = [],
  activeId = null,
  onSelect = () => {},
  onNew = () => {},
  onDelete = () => {},
  onRename = () => {},
  open = false,
  onClose = () => {},
  desktopOpen = true,
  onToggleDesktop = () => {},
  onHelp,
}) {
  const location = useLocation();
  const { user } = useAuth();
  const [menuId, setMenuId] = useState(null);
  const sidebarRef = useRef(null);
  const [codexNotice, setCodexNotice] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [notice, setNotice] = useState("");
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem("xryon_pinned_chats") || "[]"); } catch { return []; }
  });
  const isAdmin = isAdminUser(user);

  useEffect(() => {
    if (menuId == null) return;
    const handlePointerDown = (event) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target)) setMenuId(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setMenuId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuId]);

  const items = isAdminUser(user)
    ? [...links, { to: "/admin", label: "Admin", icon: Shield }]
    : links;

  const history = useMemo(() => {
    return [...conversations]
      .filter(Boolean)
      .sort((a, b) => {
        const pa = pinned.includes(a.id) ? 1 : 0;
        const pb = pinned.includes(b.id) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || ""));
      })
      .slice(0, 50);
  }, [conversations, pinned]);

  const flash = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 1800);
  };

  const togglePin = (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuId(null);
    const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [id, ...pinned];
    setPinned(next);
    try { localStorage.setItem("xryon_pinned_chats", JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  const loadTranscript = async (conversation) => {
    const msgs = await api.entities.Message.filter({ conversation_id: conversation.id }, "created_date");
    return msgs
      .map((m) => `**${m.role === "user" ? "You" : "Xyron"}:**\n\n${m.content || "(attachment)"}`)
      .join("\n\n---\n\n");
  };

  const shareItem = async (event, conversation) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuId(null);
    try {
      const text = await loadTranscript(conversation);
      if (!text) return flash("Nothing to copy yet");
      await navigator.clipboard.writeText(text);
      flash("Chat copied");
    } catch { flash("Couldn't copy"); }
  };

  const exportItem = async (event, conversation) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuId(null);
    try {
      const text = await loadTranscript(conversation);
      if (!text) return flash("Nothing to export yet");
      const url = URL.createObjectURL(new Blob([`# ${getConversationTitle(conversation)}\n\n${text}`], { type: "text/markdown" }));
      const a = document.createElement("a");
      const safe = getConversationTitle(conversation).replace(/[^\w\- ]+/g, "").trim().slice(0, 40) || "xyron-chat";
      a.href = url; a.download = `${safe}.md`; a.click();
      URL.revokeObjectURL(url);
    } catch { flash("Export failed"); }
  };

  const selectConversation = (id) => {
    setMenuId(null);
    onSelect(id);
  };

  const renameItem = async (event, conversation) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuId(null);
    setRenameValue(getConversationTitle(conversation));
    setRenamingId(conversation.id);
  };

  const commitRename = async (conversation) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title || title === getConversationTitle(conversation)) return;
    try { await onRename(conversation.id, title); } catch { flash("Rename failed"); }
  };

  const deleteItem = async (event, id) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuId(null);
    setConfirmId(null);
    await onDelete(id);
  };

  const content = (
    <aside ref={sidebarRef} className="xyron-mobile-sidebar xyron-safe-left flex h-full w-[min(18rem,88vw)] max-w-full flex-col border-r border-white/10 bg-[#0a0a0c]">
      <div className="flex items-center justify-between px-5 py-5">
        <Link to="/" onClick={onClose} className="flex items-center gap-3">
          <Logo size={34} />
          <span className="font-bold tracking-tight">Xyron</span>
        </Link>
        <div className="flex items-center gap-1">
          <button type="button" className="hidden h-8 w-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white md:grid" onClick={onToggleDesktop} aria-label="Collapse history sidebar" title="Collapse sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <button className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 transition hover:bg-white/10 hover:text-white md:hidden" onClick={onClose} aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          type="button"
          onClick={() => { setMenuId(null); onNew(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>

      <nav className="space-y-1 px-3">
        {items.map(({ to, label, icon: Icon, tag }) => (
          to === "/codex" && !isAdmin ? (
            <button
              key={to}
              type="button"
              onClick={() => setCodexNotice(true)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-neutral-500 transition hover:bg-white/5 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ) : (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${location.pathname === to ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tag && <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{tag}</span>}
          </Link>
          )
        ))}
      </nav>
      {notice && <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-white/15 bg-[#151518] px-4 py-2 text-xs text-white shadow-xl"><Check className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />{notice}</div>}
      {codexNotice && <CodexComingSoon onClose={() => setCodexNotice(false)} />}

      <section className="mt-4 flex min-h-0 flex-1 flex-col border-t border-white/10 px-3 pt-4">
        <div className="mb-2 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <History className="h-3.5 w-3.5" />
            History
          </div>
          {history.length > 0 && (
            <span className="text-[10px] text-neutral-700">{history.length}</span>
          )}
        </div>

        <div onScroll={() => menuId != null && setMenuId(null)} className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center">
              <History className="mx-auto mb-2 h-5 w-5 text-neutral-700" />
              <p className="text-xs text-neutral-600">Your conversations will appear here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {history.map((conversation) => {
                const selected = conversation.id === activeId;
                const title = getConversationTitle(conversation);
                const date = formatHistoryDate(conversation.updated_date || conversation.created_date);

                return (
                  <div key={conversation.id} className="relative group">
                    {renamingId === conversation.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        maxLength={80}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => commitRename(conversation)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") { setRenamingId(null); }
                        }}
                        className="w-full rounded-xl border border-white/30 bg-black/40 px-3 py-2.5 text-xs text-white outline-none"
                        aria-label="Rename conversation"
                      />
                    ) : (
                    <button
                      type="button"
                      onClick={() => selectConversation(conversation.id)}
                      className={`w-full rounded-xl px-3 py-2.5 pr-9 text-left transition ${selected ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}
                      title={title}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${selected ? "text-white" : "text-neutral-600"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 truncate text-xs font-medium">{pinned.includes(conversation.id) && <Pin className="h-3 w-3 shrink-0 text-neutral-500" />}<span className="truncate">{title}</span></p>
                          {date && <p className="mt-0.5 text-[10px] text-neutral-600">{date}</p>}
                        </div>
                      </div>
                    </button>
                    )}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const r = event.currentTarget.getBoundingClientRect();
                        const menuH = 232;
                        const top = r.bottom + menuH > window.innerHeight ? Math.max(8, r.top - menuH) : r.bottom + 4;
                        setMenuPos({ top, left: Math.max(8, Math.min(r.right - 176, window.innerWidth - 184)) });
                        setConfirmId(null);
                        setMenuId((current) => current === conversation.id ? null : conversation.id);
                      }}
                      className={`absolute right-1.5 top-2 grid h-8 w-8 touch-manipulation place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white sm:h-7 sm:w-7 sm:text-neutral-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 ${menuId === conversation.id ? "opacity-100" : ""}`}
                      aria-label={`Options for ${title}`} aria-haspopup="menu" aria-expanded={menuId === conversation.id}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {menuId === conversation.id && (
                      <div
                        role="menu"
                        style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
                        className="z-[70] w-44 rounded-xl border border-white/15 bg-[#151518] p-1.5 shadow-2xl shadow-black/60"
                      >
                        {confirmId === conversation.id ? (
                          <div className="p-1.5">
                            <p className="mb-2 text-xs text-neutral-300">Delete this chat?</p>
                            <div className="flex gap-1.5">
                              <button type="button" onClick={(e) => { e.stopPropagation(); setConfirmId(null); setMenuId(null); }} className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-xs text-white hover:bg-white/15">Cancel</button>
                              <button type="button" onClick={(e) => deleteItem(e, conversation.id)} className="flex-1 rounded-lg bg-red-500/20 px-2 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/30">Delete</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button type="button" role="menuitem" onClick={(e) => renameItem(e, conversation)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-neutral-200 hover:bg-white/10">
                              <Pencil className="h-3.5 w-3.5" /> Rename
                            </button>
                            <button type="button" role="menuitem" onClick={(e) => togglePin(e, conversation.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-neutral-200 hover:bg-white/10">
                              {pinned.includes(conversation.id) ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                              {pinned.includes(conversation.id) ? "Unpin" : "Pin to top"}
                            </button>
                            <button type="button" role="menuitem" onClick={(e) => shareItem(e, conversation)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-neutral-200 hover:bg-white/10">
                              <Share2 className="h-3.5 w-3.5" /> Copy chat
                            </button>
                            <button type="button" role="menuitem" onClick={(e) => exportItem(e, conversation)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-neutral-200 hover:bg-white/10">
                              <Download className="h-3.5 w-3.5" /> Export (.md)
                            </button>
                            <div className="my-1 h-px bg-white/10" />
                            <button type="button" role="menuitem" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(conversation.id); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-red-400 hover:bg-red-500/10">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="mt-auto border-t border-white/10 pt-3">
        <ProfileDock onHelp={onHelp} />
      </div>
    </aside>
  );

  return (
    <>
      <div className={`fixed inset-y-0 left-0 z-40 hidden w-72 md:block transition-transform duration-200 ${desktopOpen ? "translate-x-0" : "-translate-x-full"}`}>{content}</div>
      {open && (
        <div className="xyron-sidebar-overlay fixed inset-0 z-50 overflow-hidden md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <div className="relative h-[100dvh] w-full">{content}</div>
        </div>
      )}
    </>
  );
}

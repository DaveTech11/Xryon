import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  X,
  PanelLeftClose,
  MessageSquare,
  Code2,
  FolderKanban,
  Sparkles,
  Crown,
  Shield,
  Plus,
  Brain,
  History,
  MoreHorizontal,
  Trash2,
  Pencil,
  Pin,
  PinOff,
  Share2,
  Download,
  Check,
  Music2,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { api } from "../../api/client";
import Logo from "./Logo";
import ProfileDock from "./ProfileDock";
import { useAuth } from "../../lib/AuthContext";
import { isAdminUser } from "../../lib/adminEmails";

const links = [
  { to: "/", label: "Chat", icon: MessageSquare },
  { to: "/codex", label: "Codex", icon: Code2 },
  { to: "/my-projects", label: "My Projects", icon: FolderKanban },
  { to: "/artifacts", label: "Artifacts", icon: Sparkles },
  { to: "/intelligence", label: "Xyron Brain", icon: Brain },
  { to: "/premium", label: "Premium", icon: Crown },
];

// Everything under the "Explore" menu. Add a line here (e.g. Maps) and it shows up in the flyout.
const exploreItems = [
  { to: "/music", label: "Music", icon: Music2, tag: "New" },
  { to: "/images", label: "Images", icon: ImageIcon },
];

// ---- PHONE drawer only (the laptop sidebar below is unchanged) ----
const mainLinks = [
  { to: "/", label: "Chats", icon: MessageSquare },
  { to: "/my-projects", label: "Projects", icon: FolderKanban },
  { to: "/codex", label: "Codex", icon: Code2 },
];
// "More" on the phone: Images and Music first, the rest below them.
const moreMain = [
  { to: "/images", label: "Images", icon: ImageIcon },
  { to: "/music", label: "Music", icon: Music2, tag: "New" },
];
const moreOther = [
  { to: "/intelligence", label: "Xyron Brain", icon: Brain },
  { to: "/premium", label: "Premium", icon: Crown },
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
  const { user, isAuthenticated } = useAuth();
  const [menuId, setMenuId] = useState(null);
  const sidebarRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [exploreOpen, setExploreOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false); // phone drawer
  const [explorePos, setExplorePos] = useState({ top: 0, left: 0 });
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [notice, setNotice] = useState("");
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem("xryon_pinned_chats") || "[]"); } catch { return []; }
  });

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

  useEffect(() => {
    if (!exploreOpen) return;
    const down = (event) => {
      if (event.target.closest?.("[data-explore]")) return;
      setExploreOpen(false);
    };
    const key = (event) => { if (event.key === "Escape") setExploreOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [exploreOpen]);

  const exploreActive = exploreItems.some((x) => x.to === location.pathname);

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

  const adminLink = isAdminUser(user) ? [{ to: "/admin", label: "Admin", icon: Shield }] : [];
  const otherItems = [...moreOther, ...adminLink];
  const moreActive = [...moreMain, ...otherItems].some((x) => x.to === location.pathname);
  // Open "More" automatically when the current page lives inside it.
  useEffect(() => { if (moreActive) setMoreOpen(true); }, [moreActive]);

  // Opens the chat's menu (Rename / Pin / Copy / Export / Delete) just under, or above, the given box.
  const openChatMenu = (id, r, toggle = true) => {
    const menuH = 232;
    const top = r.bottom + menuH > window.innerHeight ? Math.max(8, r.top - menuH) : r.bottom + 4;
    setMenuPos({ top, left: Math.max(8, Math.min(r.right - 176, window.innerWidth - 184)) });
    setConfirmId(null);
    setMenuId((current) => (toggle && current === id ? null : id));
  };
  // Phones: press and hold a chat to open its menu (the "..." button is hidden there to keep the list clean).
  const pressRef = useRef({ timer: null, fired: false });
  const startPress = (event, id) => {
    if (event.pointerType !== "touch") return;
    const el = event.currentTarget;
    pressRef.current.fired = false;
    clearTimeout(pressRef.current.timer);
    pressRef.current.timer = setTimeout(() => { pressRef.current.fired = true; try { navigator.vibrate?.(12); } catch { /* not supported */ } openChatMenu(id, el.getBoundingClientRect(), false); }, 450);
  };
  const endPress = () => clearTimeout(pressRef.current.timer);

  const desktopContent = (
    <aside ref={sidebarRef} onScroll={() => menuId != null && setMenuId(null)} className="xyron-mobile-sidebar xs-side xyron-safe-left flex h-full min-h-0 w-full max-w-full touch-pan-y flex-col overflow-y-auto overflow-x-hidden overscroll-contain bg-[#0a0a0c] md:border-r md:border-white/10 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
      <div className="xs-head relative flex items-center justify-between px-5 py-5">
        <Link to="/" onClick={onClose} className="flex items-center gap-3.5">
          <Logo size={38} className="xs-logo" />
          <span className="leading-tight">
            <span className="xs-title block text-[22px] font-bold tracking-tight text-white">Xyron</span>
            <span className="xs-tag block text-[9.5px] font-medium uppercase tracking-[0.3em] text-neutral-500">Your AI assistant</span>
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <button type="button" className="hidden h-8 w-8 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white md:grid" onClick={onToggleDesktop} aria-label="Collapse history sidebar" title="Collapse sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </button>
          <button className="grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/[.04] text-neutral-200 transition hover:bg-white/10 hover:text-white md:hidden" onClick={onClose} aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <span aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-px w-32 bg-gradient-to-r from-violet-500 via-violet-500/40 to-transparent" />
      </div>

      <div className="xs-new-wrap px-4 pb-4">
        <button
          type="button"
          onClick={() => { setMenuId(null); onNew(); }}
          className="xs-new flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>

      <nav className="xs-nav space-y-1 px-3">
        {items.map(({ to, label, icon: Icon, tag }) => (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className={`xs-item flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${location.pathname === to ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {tag && <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{tag}</span>}
          </Link>
        ))}
        <div data-explore>
          <button
            type="button"
            onClick={(event) => {
              const r = event.currentTarget.getBoundingClientRect();
              setExplorePos({ top: Math.max(8, Math.min(r.top, window.innerHeight - 8 - exploreItems.length * 46 - 16)), left: r.right + 8 });
              setExploreOpen((v) => !v);
            }}
            aria-haspopup="menu"
            aria-expanded={exploreOpen}
            className={`xs-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${exploreOpen || exploreActive ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-white"}`}
          >
            <MoreHorizontal className="h-4 w-4" />
            Explore
            <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform md:rotate-0 ${exploreOpen ? "rotate-90" : ""}`} />
          </button>

          {/* Phones: opens right under the button */}
          {exploreOpen && (
            <div role="menu" className="mt-1 space-y-1 pl-3 md:hidden">
              {exploreItems.map(({ to, label, icon: Icon, tag }) => (
                <Link key={to} to={to} role="menuitem" onClick={() => { setExploreOpen(false); onClose(); }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${location.pathname === to ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}>
                  <Icon className="h-4 w-4" />{label}
                  {tag && <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{tag}</span>}
                </Link>
              ))}
            </div>
          )}

          {/* Desktop: floating box to the right of the sidebar */}
          {exploreOpen && (
            <div role="menu" style={{ position: "fixed", top: explorePos.top, left: explorePos.left }} className="z-[70] hidden w-52 rounded-2xl border border-white/15 bg-[#1b1b1e] p-1.5 shadow-2xl shadow-black/60 md:block">
              {exploreItems.map(({ to, label, icon: Icon, tag }) => (
                <Link key={to} to={to} role="menuitem" onClick={() => { setExploreOpen(false); onClose(); }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${location.pathname === to ? "bg-white/10 text-white" : "text-neutral-200 hover:bg-white/10"}`}>
                  <Icon className="h-4 w-4" />{label}
                  {tag && <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{tag}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
      </nav>
      {notice && <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-white/15 bg-[#151518] px-4 py-2 text-xs text-white shadow-xl"><Check className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />{notice}</div>}

      <section className="xs-hist mt-4 flex shrink-0 flex-col border-t border-white/10 px-3 pb-3 pt-4">
        <div className="xs-hist-h mb-2 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <History className="h-3.5 w-3.5" />
            History
          </div>
          {history.length > 0 && (
            <span className="text-[10px] text-neutral-700">{history.length}</span>
          )}
        </div>

        <div className="pr-1">
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
                      className={`xs-hist-item w-full rounded-xl px-3 py-2.5 pr-9 text-left transition ${selected ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}
                      title={title}
                    >
                      <div className="flex items-start gap-2">
                        <MessageSquare className={`xs-hist-ico mt-0.5 h-3.5 w-3.5 shrink-0 ${selected ? "text-white" : "text-neutral-600"}`} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 truncate text-xs font-medium">{pinned.includes(conversation.id) && <Pin className="h-3 w-3 shrink-0 text-neutral-500" />}<span className="truncate">{title}</span></p>
                          {date && <p className="xs-hist-date mt-0.5 text-[10px] text-neutral-600">{date}</p>}
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

      <div className="xs-dock sticky bottom-0 z-10 mt-auto shrink-0 border-t border-white/10 bg-[#0a0a0c] pt-3">
        <ProfileDock onHelp={onHelp} />
      </div>
    </aside>
  );

  const renderSide = (mobile) => (
    <aside ref={sidebarRef} className="xcl-side xyron-safe-left flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden bg-[#0e0e0f] md:border-r md:border-white/10">
      <div className="xcl-head flex shrink-0 items-center justify-between px-6 pb-3 pt-6">
        <Link to="/" onClick={onClose} className={mobile ? "flex items-center" : "flex items-center gap-2.5"} aria-label="Xyron home">
          {!mobile && <Logo size={26} className="xs-logo" />}
          <span className="xcl-title font-serif text-[28px] font-medium leading-none tracking-tight text-white">Xyron</span>
        </Link>
        {!mobile && (
          <div className="flex items-center gap-1">
            <button type="button" className="hidden h-9 w-9 place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white md:grid" onClick={onToggleDesktop} aria-label="Collapse sidebar" title="Collapse sidebar">
              <PanelLeftClose className="h-[18px] w-[18px]" />
            </button>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white md:hidden" onClick={onClose} aria-label="Close sidebar">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <nav className="shrink-0 px-3 pt-2" aria-label="Main">
        {mainLinks.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link key={to} to={to} onClick={onClose} aria-current={active ? "page" : undefined}
              className={`xcl-row flex items-center gap-4 rounded-2xl px-3 ${mobile ? "py-5" : "py-3.5"} text-[16px] transition ${active ? "bg-white/10 text-white" : "text-neutral-200 hover:bg-white/5 hover:text-white"}`}>
              <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={1.6} />
              {label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
          className={`xcl-row flex w-full items-center gap-4 rounded-2xl px-3 ${mobile ? "py-5 text-[16px]" : "py-3 text-[15px]"} text-left transition ${moreActive && !moreOpen ? "bg-white/10 text-white" : mobile ? "text-neutral-200 hover:bg-white/5 hover:text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}>
          <MoreHorizontal className="h-[22px] w-[22px] shrink-0" strokeWidth={1.6} />
          More
          <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
        </button>
        {moreOpen && (
          <div className="mb-1 ml-5 border-l border-white/10 pl-2">
            {moreMain.map(({ to, label, icon: Icon, tag }) => {
              const active = location.pathname === to;
              return (
                <Link key={to} to={to} onClick={onClose} aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3.5 rounded-xl px-3 py-3 text-[15px] transition ${active ? "bg-white/10 text-white" : "text-neutral-200 hover:bg-white/5 hover:text-white"}`}>
                  <Icon className="h-[20px] w-[20px] shrink-0" strokeWidth={1.6} />
                  {label}
                  {tag && <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{tag}</span>}
                </Link>
              );
            })}
            <div className="my-1.5 ml-3 h-px bg-white/10" />
            {otherItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link key={to} to={to} onClick={onClose} aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition ${active ? "bg-white/10 text-white" : "text-neutral-400 hover:bg-white/5 hover:text-white"}`}>
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>
      {notice && <div role="status" className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-white/15 bg-[#151518] px-4 py-2 text-xs text-white shadow-xl"><Check className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />{notice}</div>}

      <section onScroll={() => menuId != null && setMenuId(null)} className="xcl-recents mx-4 mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-white/10 pb-3 pt-5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
        <p className="px-2 pb-2 text-[14px] font-medium text-neutral-500">Recents</p>

        <div className="pr-1">
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-5 text-center">
              <History className="mx-auto mb-2 h-5 w-5 text-neutral-700" />
              <p className="text-sm text-neutral-600">Your conversations will appear here.</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {history.map((conversation) => {
                const selected = conversation.id === activeId;
                const title = getConversationTitle(conversation);
                
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
                      onClick={(e) => { if (pressRef.current.fired) { pressRef.current.fired = false; e.preventDefault(); return; } selectConversation(conversation.id); }}
                      onPointerDown={(e) => mobile && startPress(e, conversation.id)}
                      onPointerUp={endPress}
                      onPointerLeave={endPress}
                      onPointerCancel={endPress}
                      onContextMenu={(e) => { if (e.pointerType === "touch" || e.nativeEvent?.pointerType === "touch") e.preventDefault(); }}
                      className={`xcl-hist w-full ${mobile ? "select-none [-webkit-touch-callout:none]" : ""} rounded-xl px-2.5 py-3 pr-10 text-left text-[15px] transition ${selected ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5 hover:text-white"}`}
                      title={title}
                    >
                      <span className="flex items-center gap-1.5">{pinned.includes(conversation.id) && <Pin className="h-3 w-3 shrink-0 text-neutral-500" />}<span className="truncate">{title}</span></span>
                    </button>
                    )}

                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openChatMenu(conversation.id, event.currentTarget.getBoundingClientRect());
                      }}
                      className={`absolute right-1.5 top-2 ${mobile ? "hidden" : "grid"} h-8 w-8 touch-manipulation place-items-center rounded-lg text-neutral-400 transition hover:bg-white/10 hover:text-white sm:h-7 sm:w-7 sm:text-neutral-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 ${menuId === conversation.id ? "opacity-100" : ""}`}
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

      <div className="shrink-0 border-t border-white/5 bg-[#0e0e0f]">
        {isAuthenticated ? (
          mobile ? (
            <ProfileDock compact onHelp={onHelp}>
              <button type="button" onClick={() => { setMenuId(null); onNew(); onClose(); }} className="xcl-new flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-black shadow-lg shadow-black/30 transition hover:bg-neutral-200 active:scale-[0.97]">
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} /> New chat
              </button>
            </ProfileDock>
          ) : (
            <ProfileDock onHelp={onHelp} />
          )
        ) : (
          <>
            <div className="flex justify-end px-4 pt-3">
          <button type="button" onClick={() => { setMenuId(null); onNew(); onClose(); }} className="xcl-new flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-black shadow-lg shadow-black/30 transition hover:bg-neutral-200 active:scale-[0.97]">
            <Plus className="h-[18px] w-[18px]" strokeWidth={2.2} /> New chat
          </button>
            </div>
            <ProfileDock onHelp={onHelp} />
          </>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div className={`fixed inset-y-0 left-0 z-40 hidden w-[var(--xs-sw,18rem)] md:block transition-transform duration-200 ${desktopOpen ? "translate-x-0" : "-translate-x-full"}`}>{desktopContent}</div>
      {open && (
        <div className="xyron-sidebar-overlay fixed inset-0 z-50 overflow-hidden md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/60" />
          <div className="xcl-drawer relative h-full w-[min(84%,20rem)] overflow-hidden rounded-r-[28px] shadow-2xl shadow-black/70">{renderSide(true)}</div>
        </div>
      )}
    </>
  );
}

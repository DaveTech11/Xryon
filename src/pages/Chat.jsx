import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { streamMainChat } from "../lib/chatStream";
import { newTrail, applyStep, trailMarkdown } from "../lib/reaTrail";
import TypeGreeting from "../components/xyron/TypeGreeting";
import { Menu, MoreVertical, Sparkles, LifeBuoy, PanelLeftClose, PanelLeftOpen, PanelLeft, ArrowDown } from "lucide-react";
import Sidebar from "../components/xyron/Sidebar";
import MessageBubble from "../components/xyron/MessageBubble";
import Composer from "../components/xyron/Composer";
import { expandImagePrompt, getImageShortcut } from "../components/xyron/ImageShortcuts";
import { detectEntityQuery, fetchEntityPreview } from "../lib/entityPreview";
import { detectComparisonQuery, fetchComparisonPreview } from "../lib/comparison";
import { parseCommand, stripCommand, XMODE_PROMPTS } from "../lib/commands";
import { XYRON_PERSONA_PROMPT, XYRON_IDENTITY_PROMPT, XYRON_RESPONSE_STYLE_PROMPT, XYRON_MULTI_FILE_PROMPT, XYRON_FILE_NOTES_PROMPT, XYRON_AGENT_PROMPT, XYRON_GENERAL_PROMPT, XYRON_CASUAL_PROMPT, isSmallTalk, XYRON_SHORT_REPLY_PROMPT, XYRON_IMAGE_ABILITY_PROMPT, isDaveTechCommand, XYRON_NO_CARDS_PROMPT } from "../lib/persona";
import { isOwnerQuestion, OWNER_REPLY } from "../lib/xyronLabs";
import { buildMemoryPrompt, handleMemoryCommand } from "../lib/memory";
import { attachmentsOf, customWithFile, fileKind, optionsFor, withFile } from "../lib/fileKinds";
import { isVideoRequest, videoAspect } from "../../videoIntent.mjs";
import { compressImage } from "../lib/compressImage";
import { ContinueChip, FileActions } from "../components/xyron/FileActions";
import { XYRON_IMAGE_PROMPT, XYRON_IMAGES_SHOWN_PROMPT, XYRON_IMAGE_GUIDE_PROMPT, extractImageTag, visualQueryFromText, imageRequestFromText } from "../lib/imageSearch";
import { XYRON_RICH_PROMPT, hasRichList, hasRichImages, hasRichDoc, hasRichPicks } from "../lib/richBlocks";
import { wantsNames, namingPrompt } from "../lib/namingIntent";
import { needsCodingPrompts } from "../lib/codingGate";
import { isZipFile, wantsZipDownload, wantsCode, wantsBuild, isBuildFollowUp, XYRON_BUILD_PROMPT, XYRON_ZIP_PROMPT, XYRON_NO_ZIP_PROMPT, XYRON_ZIP_REQUEST_PROMPT, XYRON_CODING_PROMPT } from "../lib/zipMode";
import RedOrb from "../components/xyron/RedOrb";
import { useAuth } from "../lib/AuthContext";
import ImageForge from "../components/xyron/ImageForge";
import ModelSwitcher from "../components/xyron/ModelSwitcher";
import HelpCenter from "../components/xyron/HelpCenter";
import ContextMenu from "../components/xyron/ContextMenu";
import FeedbackModal from "../components/xyron/FeedbackModal";
import LimitUpgradeModal from "../components/xyron/LimitUpgradeModal";
import QuotaModal from "../components/xyron/QuotaModal";
import ErrorPopup from "../components/xyron/ErrorPopup";
import ChatPausedModal from "../components/xyron/ChatPausedModal";
import AuthRequiredModal from "../components/AuthRequiredModal";
import VoiceChat from "../components/xyron/VoiceChat";
import { isAdminUser } from "../lib/adminEmails";
import { useKeyboardInset } from "../hooks/use-keyboard-inset";
import useEdgeSwipe from "../hooks/use-edge-swipe";
import { PREMIUM_MODELS, DEFAULT_FREE_MODEL, CHARART_MODEL_MODES } from "../lib/models";

// A message that holds a GitHub repository link and asks to host / deploy it (Render is the host).
const GITHUB_LINK = /https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/\s?#]+)[^\s)>\]"']*)?(?=[\s)>\]"',;!?]|\/?$)/i;
const HOST_WORDS = /\b(host|hosting|hosted|deploy|deployment|deployed|render|publish|go live|put (?:it|this) (?:online|live)|launch)\b/i;
function hostRequestFromText(text) {
  const t = String(text || "");
  if (!HOST_WORDS.test(t)) return null;
  const m = GITHUB_LINK.exec(t);
  if (!m) return null;
  const repo = m[2].replace(/[.-]+$/, "").replace(/\.git$/i, "");
  if (!repo) return null;
  return { url: `https://github.com/${m[1]}/${repo}`, owner: m[1], repo, ...(m[3] ? { branch: m[3] } : {}) };
}
import {
  getSetting,
  setSetting,
  isWebSearchOn,
  isRichCardsOn,
  isJoyfulOn,
  JOYFUL_PROMPT,
  getCurrentUser,
  checkPremium,
  isImageRequest,
  imageDetailsAsk,
  isEditPreviousImageRequest,
  isImageFollowUpEdit,
  isDocumentationRequest,
  getDailyFileCount,
  incrementFileCount,
  getDailyDocumentationCount,
  incrementDocumentationCount,
  FREE_FILE_LIMIT,
  FREE_DOCUMENTATION_LIMIT,
  isMessageQuotaExceeded,
  isImageQuotaExceeded,
  recordMessageQuotaUse,
  recordImageQuotaUse,
  getQuotaResetClockTime,
  getDailyResetClockTime,
} from "../lib/settings";

// Header buttons: solid and thick on purpose (no see-through backgrounds).
const headerIconBtn = "xs-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-[#1a1a1d] text-white transition hover:bg-[#2a2a2e] active:scale-95";
const headerBareBtn = "grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/10 active:scale-95";
const headerPillBtn = "xs-pill flex h-10 items-center gap-2 rounded-xl border border-white/25 bg-[#232326] px-4 text-sm font-medium text-white shadow-md shadow-black/50 transition hover:bg-[#2f2f33] active:scale-95";

export default function Chat() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const activeIdRef = useRef(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const activeRequestRef = useRef(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const pendingUrlsRef = useRef([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageCommandModal, setImageCommandModal] = useState(null); // "meme" | "text" | null
  const [memeFields, setMemeFields] = useState({ topText: "", bottomText: "", backgroundImage: "", fontFamily: "", textColor: "", strokeColor: "" });
  const [textFields, setTextFields] = useState({ text: "", width: "", height: "", fontFamily: "", textColor: "", strokeColor: "" });
  const [forge, setForge] = useState({ prompt: "", regenerating: false, previousImageUrl: null, ratio: 1 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEdgeSwipe({ isOpen: sidebarOpen, onOpen: () => setSidebarOpen(true), onClose: () => setSidebarOpen(false) }); // swipe from the left edge opens the sidebar on phones
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(() => {
    try { return localStorage.getItem("xyron_sidebar_open") !== "0"; } catch { return true; }
  });
  const [isPremium, setIsPremium] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [feedbackKind, setFeedbackKind] = useState(null); // null | "feedback" | "bug"
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [limitTypes, setLimitTypes] = useState([]);
  const [upgradeReason, setUpgradeReason] = useState("limit");
  // Hard free-tier gate: once a free user hits 50 questions or 5 image
  // generations in a rolling 4-hour window, every further attempt of that
  // kind is refused (not sent) and this popup is shown again each time,
  // until the window resets.
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  // Shown (instead of any raw error message) when a request to the backend fails.
  const [errorOpen, setErrorOpen] = useState(false);
  // The last request the person sent, so the popup's "Continue" can re-send it.
  // `registered` = its user message already made it into the thread.
  const attemptRef = useRef(null);
  const [quotaKind, setQuotaKind] = useState("message");
  const [pausedOpen, setPausedOpen] = useState(false);
  const [pausedResetAt, setPausedResetAt] = useState(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [authRequiredOpen, setAuthRequiredOpen] = useState(false);
  const endRef = useRef(null);
  const { user: authUser } = useAuth();
  const firstName = String(authUser?.full_name || "").trim().split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late night thoughts" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const location = useLocation();
  const navigate = useNavigate();
  // True once plan/admin status is known, so a hand-off from the Anime page is
  // never sent with the wrong limits.
  const [tierReady, setTierReady] = useState(false);
  const animeEditHandled = useRef(null);

  useEffect(() => {
    Promise.all([checkPremium(), getCurrentUser()]).then(([premium, user]) => {
      setIsPremium(premium);
      setIsAdmin(isAdminUser(user));
      // The NEXUS models were renamed to Xyron Nexus: anyone who had an old name saved moves to the new one (this runs first).
      const LEGACY_MODELS = { "NEXUS AUTO": "Xyron Nexus Auto", "NEXUS V0 MINI": "Xyron Nexus V0 Mini", "NEXUS V0 MINI PRO": "Xyron Nexus V0 Mini", "NEXUS V0 PRO": "Xyron Nexus V0 Pro", "NEXUS V1 PRO": "Xyron Nexus V1 Pro" };
      const savedModel = getSetting("selectedModel", DEFAULT_FREE_MODEL);
      if (LEGACY_MODELS[savedModel]) setSetting("selectedModel", LEGACY_MODELS[savedModel]);
      // A saved premium-only model on an account without Premium quietly goes back to the free one.
      if (!premium && !isAdminUser(user) && PREMIUM_MODELS.includes(getSetting("selectedModel", DEFAULT_FREE_MODEL))) setSetting("selectedModel", DEFAULT_FREE_MODEL);
      setTierReady(true);
    }).catch(() => setTierReady(true));
  }, []);

  // Pick up plan changes made by an admin (free Premium for everyone, a grant by email)
  // while the chat is open: re-check when the tab regains focus and once a minute.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) checkPremium().then(setIsPremium).catch(() => {}); };
    const t = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  // PC only: remember the sidebar state and let Ctrl/Cmd + B toggle it.
  useEffect(() => { try { localStorage.setItem("xyron_sidebar_open", desktopSidebarOpen ? "1" : "0"); } catch { /* storage unavailable */ } }, [desktopSidebarOpen]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b" && window.matchMedia("(min-width: 768px)").matches) {
        e.preventDefault();
        setDesktopSidebarOpen((cur) => !cur);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadConversations = async () => setConversations(await api.entities.Conversation.list("-created_date", 50));
  useEffect(() => { loadConversations(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking, imageLoading, uploadStatus]);
  // When the phone keyboard opens, keep the newest message in view above the chat box.
  // "Jump to latest" arrow: shows when you've scrolled up away from the newest message.
  const [showJump, setShowJump] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      setShowJump(el.scrollHeight - window.scrollY - window.innerHeight > 300);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [messages.length]);

  useKeyboardInset((kb) => { if (kb > 0) setTimeout(() => endRef.current?.scrollIntoView({ block: "end" }), 60); });

  // If the last message in the open chat is the person's own, the answer may still be on its way (or was
  // finished by the server while they were away). Check again now, when they come back to the tab, and every
  // few seconds for about two minutes.
  const lastIsUser = messages.length > 0 && messages[messages.length - 1]?.role === "user" && !messages[messages.length - 1]?.local;
  useEffect(() => {
    if (!activeId || thinking || imageLoading || !lastIsUser) return undefined;
    let stopped = false, tries = 0;
    const check = async () => {
      if (stopped || document.hidden) return;
      try {
        const fresh = await api.entities.Message.filter({ conversation_id: activeId }, "created_date");
        if (!stopped && activeIdRef.current === activeId && fresh.length && fresh[fresh.length - 1]?.role !== "user") setMessages(fresh);
      } catch { /* try again on the next tick */ }
    };
    const timer = setInterval(() => { if (++tries > 40) clearInterval(timer); else check(); }, 3000);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [activeId, thinking, imageLoading, lastIsUser]);

  const openConversation = async (id) => {
    setActiveId(id);
    setSidebarOpen(false);
    setMessages(await api.entities.Message.filter({ conversation_id: id }, "created_date"));
  };

  const newChat = () => { setActiveId(null); setMessages([]); setSidebarOpen(false); };

  const renameConversation = async (id, title) => {
    await api.entities.Conversation.update(id, { title, updated_date: new Date().toISOString() });
    await loadConversations();
  };

  const deleteConversation = async (id) => {
    await api.entities.Message.deleteMany({ conversation_id: id });
    await api.entities.Conversation.delete(id);
    if (id === activeId) newChat();
    loadConversations();
  };

  const showLimit = (types) => {
    setLimitTypes([...new Set(types)]);
    setUpgradeReason("limit");
    setUpgradeOpen(true);
  };


  const transcript = () => messages.filter((m) => !m.local).map((m) => `**${m.role === "user" ? "You" : "Xyron"}:**\n\n${m.content || (m.preview?.title ? `[Preview: ${m.preview.title}]` : m.comparison ? `[Comparison: ${m.comparison.aQuery || m.comparison.a?.title || "?"} vs ${m.comparison.bQuery || m.comparison.b?.title || "?"}]` : "(image)")}`).join("\n\n---\n\n");
  // Local-only notices (not saved, never sent to the model).
  const notify = (content) => setMessages((cur) => [...cur, { role: "assistant", content, local: true }]);
  const store = (key, fn) => {
    try { const list = JSON.parse(localStorage.getItem(key) || "[]"); localStorage.setItem(key, JSON.stringify(fn(list).slice(-50))); return true; } catch { return false; }
  };
  const runAction = (name) => {
    const real = messages.filter((m) => !m.local);
    if (name === "/help") { setHelpOpen(true); return; }
    if (name === "/bookmark") {
      const last = [...real].reverse().find((m) => m.role === "assistant" && m.content);
      if (!last) return notify("Nothing to bookmark yet.");
      store("xryon_bookmarks", (l) => [...l, { content: last.content, conversation_id: activeId, date: new Date().toISOString() }]);
      notify("🔖 Bookmarked the last reply.");
    } else if (name === "/snapshot") {
      if (!real.length) return notify("Nothing to snapshot yet.");
      store("xryon_snapshots", (l) => [...l, { conversation_id: activeId, date: new Date().toISOString(), messages: real }]);
      notify(`📸 Snapshot saved (${real.length} messages).`);
    } else if (name === "/context") {
      const mode = getSetting("xyronMode", "auto");
      notify(`**Current context**\n\n- Mode: ${mode}\n- Persona: ${getSetting("persona", "concise")}\n- Custom system prompt: ${getSetting("systemPrompt", "") ? "set" : "none"}\n- Model: ${getSetting("selectedModel", "Xyron 4.1")}\n- Messages sent to the model: ${real.length}`);
    } else if (name === "/status") {
      notify(`**Status**\n\n- Messages in this chat: ${real.length}\n- Chat messages: Unlimited\n- Image generation: Free\n- Files left today: ${Math.max(0, FREE_FILE_LIMIT - getDailyFileCount())}\n- Documentation left today: ${Math.max(0, FREE_DOCUMENTATION_LIMIT - getDailyDocumentationCount())}`);
    }
  };
  const exportChat = () => {
    if (!messages.length) return;
    const url = URL.createObjectURL(new Blob([transcript()], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url; a.download = "xyron-chat.md"; a.click();
    URL.revokeObjectURL(url);
  };
  const shareChat = async () => {
    if (!messages.length) return;
    const text = transcript();
    // Phones/tablets get the real share sheet; everything else copies the chat to the clipboard.
    try {
      if (navigator.share && /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent)) { await navigator.share({ title: "Xyron chat", text }); return "shared"; }
    } catch (e) { if (e?.name === "AbortError") return "shared"; }
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
    return "copied";
  };
  const regenerate = async () => {
    if (thinking || imageLoading) return;
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUser < 0) return;
    for (const m of messages.slice(lastUser + 1)) if (m.id) { try { await api.entities.Message.delete(m.id); } catch { /* ignore */ } }
    const base = messages.slice(0, lastUser);
    const last = messages[lastUser];
    // If the reply being regenerated was a generated image, remember its
    // URL so the Forge animation can dissolve it into the new one.
    const priorImage = messages.slice(lastUser + 1).find((m) => m.role === "assistant" && m.file_urls?.length)?.file_urls?.[0] || null;
    setMessages(base);
    // Re-running an image edit (e.g. from the Anime gallery) must stay an edit, not become a text reply.
    const keepEdit = Boolean(priorImage && last.file_urls?.length && !isImageRequest(last.content) && !getImageShortcut(last.content));
    send(last.content, [], { regenerate: true, base, fileUrls: last.file_urls || [], previousImageUrl: priorImage, editImage: keepEdit });
  };

  const touchConversation = async (id) => {
    if (!id) return;
    try { await api.entities.Conversation.update(id, { updated_date: new Date().toISOString() }); } catch { /* history refresh is best-effort */ }
    loadConversations();
  };

  const requireAuthentication = () => {
    setAuthRequiredOpen(true);
  };

  // Any backend failure ends up here: log the real reason, show the popup.
  const showError = (e) => {
    console.error("Request failed:", e);
    setThinking(false);
    setImageLoading(false);
    setUploadStatus(null);
    setErrorOpen(true);
  };

  const stopGeneration = () => {
    activeRequestRef.current?.abort?.();
    activeRequestRef.current = null;
    setThinking(false);
    setImageLoading(false);
    setUploadStatus(null);
  };

  const send = async (text, attachedFiles = [], opts = {}) => {
    const bareImageCommand = String(text || "").trim().match(/^\/(meme|text)\s*$/i);
    if (bareImageCommand && !attachedFiles.length) {
      setImageCommandModal(bareImageCommand[1].toLowerCase());
      return;
    }
    attemptRef.current = { text, attachedFiles, opts, registered: false };
    try {
      await runSend(text, attachedFiles, opts);
    } catch (e) {
      // An upload that failed must not leave a stuck "loading" message behind.
      setMessages((cur) => cur.filter((m) => !m.pendingUpload));
      pendingUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
      pendingUrlsRef.current = [];
      if (e?.status === 401 || /authentication required|not authenticated/i.test(e?.message || "")) {
        setThinking(false);
        setImageLoading(false);
        setUploadStatus(null);
        requireAuthentication();
        return;
      }
      showError(e);
      opts.onReply?.("Sorry, something went wrong. Please try again.");
    }
  };

  // "Continue" in the error popup: send the same thing again, without
  // duplicating the person's message if it is already in the thread.
  const retryLast = () => {
    setErrorOpen(false);
    const a = attemptRef.current;
    if (!a) return;
    if (a.registered) regenerate();
    else send(a.text, a.attachedFiles, a.opts);
  };

  // Arriving from the Anime gallery: the picture was already copied into the
  // person's files; send their edit prompt with it attached as an image edit.
  useEffect(() => {
    const edit = location.state?.animeEdit;
    if (!edit?.fileUrl || !tierReady || animeEditHandled.current === edit.at) return;
    animeEditHandled.current = edit.at;
    navigate(location.pathname, { replace: true, state: null });
    send(edit.prompt, [], { editImage: true, fileUrls: [edit.fileUrl] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, tierReady]);

  // Fetches the photo gallery for an AI reply and swaps it in under that reply's text. Failures
  // become a small "Retry" notice instead of an error popup; an empty result just removes the slot.
  const loadGallery = async (msgKey, msgId, query, page = 1) => {
    const patch = (images) => setMessages((cur) => cur.map((m) => ((m.key || m.id) === msgKey ? { ...m, images } : m)));
    patch({ status: "loading", query, items: [] });
    try {
      const res = await api.images.search(query, 8, page);
      const items = Array.isArray(res?.images) ? res.images : [];
      if (!items.length) { patch(undefined); return; }
      patch({ status: "ready", query, items });
      if (msgId) { try { await api.entities.Message.update(msgId, { images: { query, items } }); } catch { /* gallery still shows for this session */ } }
    } catch (e) {
      console.error("Image search failed:", e);
      patch({ status: "error", query, items: [] });
    }
  };

  // The newest picture in the recent chat: an image Xyron made, or one the person uploaded.
  const lastImageUrlIn = (list, limit = 12) => {
    let seen = 0;
    for (let i = list.length - 1; i >= 0 && seen < limit; i--, seen++) {
      const m = list[i];
      if (!m || m.local || !m.file_urls?.length) continue;
      if (m.role === "assistant") return m.file_urls[m.file_urls.length - 1];
      const imgs = attachmentsOf(m).filter((a) => a.kind === "image");
      if (imgs.length) return imgs[imgs.length - 1].url;
    }
    return null;
  };

  // "Describe edits" bar in the image viewer: edit that exact picture and send the new one back.
  const editImageFromViewer = (prompt, url) => send(prompt, [], { editImage: true, fileUrls: [url], previousImageUrl: url });

  const runSend = async (text, attachedFiles = [], opts = {}) => {
    const requestController = new AbortController();
    activeRequestRef.current = requestController;
    // The chat UI can be viewed while signed out, but actual AI requests and
    // account-based history require a signed-in Xyron account. Check here so
    // users get the friendly auth popup instead of a raw "Authentication required" error.
    try {
      await api.auth.me();
    } catch {
      requireAuthentication();
      return;
    }

    // Follow-up edit of the picture already in this chat ("use that image, write Dave Tech on it",
    // "make it darker"): edit that picture instead of answering in text.
    if (!opts.editImage && !opts.regenerate && !attachedFiles.length && !(opts.fileUrls || []).length) {
      // Wordy follow-ups look for any picture in the chat; short ones ("change to worm plus", "make it blue") only
      // count when the picture is among the last few messages.
      const prevUrl = isEditPreviousImageRequest(text) ? lastImageUrlIn(opts.base ?? messages)
        : isImageFollowUpEdit(text) ? lastImageUrlIn(opts.base ?? messages, 3) : null;
      if (prevUrl) opts = { ...opts, editImage: true, fileUrls: [prevUrl], previousImageUrl: prevUrl };
    } else if (!opts.editImage && !opts.regenerate && attachedFiles.length && attachedFiles.every((f) => f.type?.startsWith("image/")) && isImageFollowUpEdit(text, { strict: true })) {
      // A picture attached together with "change to ...": edit that picture instead of describing it.
      opts = { ...opts, editImage: true };
    }

    const command = parseCommand(text, attachedFiles);
    if (isAdmin) {
      // Admin accounts have unlimited access and never need Premium.
    }

    const isTextImage = command?.cmd.command === "/textimage";
    const isMemeImage = command?.cmd.command === "/meme";
    const isPlainTextImage = command?.cmd.command === "/text";
    const parseOptions = (arg) => { try { return JSON.parse(arg || "{}"); } catch { return {}; } };
    const imageOptions = parseOptions(command?.arg);
    const magic = command?.cmd.kind === "magic" ? command.plan : null;
    const magicText = !!magic?.text;
    const isImage = opts.editImage ? true : magic ? magic.image : (isImageRequest(text) || ["/image", "/meme", "/text"].includes(command?.cmd.command));
    // "make a promo video ..." (with or without attached files/images): planned by the server, rendered here in the browser
    const isVideo = !isImage && !command && !opts.regenerate && isVideoRequest(text, { hasFiles: attachedFiles.length > 0 || !!opts.fileUrls?.length });
    const imageShortcut = getImageShortcut(text);
    const isDocumentation = !isImage && isDocumentationRequest(text);
    const blocked = [];

    // Hard token-quota gate: 5 image generations / 50 questions per rolling
    // 4-hour window for free users. Every attempt beyond that is refused —
    // it bounces back and re-shows the popup — until the window resets.
    // When the blocked attempt involves a file or an image (upload or
    // generation), show the "Chat paused" popup instead of the plain
    // quota popup, since files/images have their own stricter limit.
    const involvesFilesOrImages = isImage || attachedFiles.length > 0;
    if (!isAdmin && !isPremium) {
      if (isImage && isImageQuotaExceeded()) {
        setPausedResetAt(getQuotaResetClockTime("image"));
        setPausedOpen(true);
        return;
      }
      if (!isImage && !isDocumentation && isMessageQuotaExceeded()) {
        if (involvesFilesOrImages) { setPausedResetAt(getQuotaResetClockTime("message")); setPausedOpen(true); return; }
        setQuotaKind("message"); setQuotaModalOpen(true); return;
      }
    }

    if (!isAdmin && !isPremium) {
      if (isDocumentation && getDailyDocumentationCount() >= FREE_DOCUMENTATION_LIMIT) blocked.push("Documentation");
      if (attachedFiles.length && getDailyFileCount() + attachedFiles.length > FREE_FILE_LIMIT) {
        setPausedResetAt(getDailyResetClockTime());
        setPausedOpen(true);
        return;
      }
    }

    if (blocked.length) {
      showLimit(blocked);
      return;
    }

    // Give immediate feedback before any file bytes are read or sent. Uploads
    // run in small concurrent batches instead of waiting for every file serially.
    const uploadedUrls = [...(opts.fileUrls || [])];
    const newZipUrls = []; // ZIP projects attached to THIS message
    const fileMeta = []; // names and sizes, so the chat can show a proper file card and remember the file
    if (attachedFiles.length) {
      setUploadStatus({ phase: "uploading", done: 0, total: attachedFiles.length });
      // Show the person's message in the chat right away (local previews + a loading spinner) instead of
      // waiting for the upload to finish. It is replaced by the real message once the files are uploaded.
      const pendingMeta = attachedFiles.map((f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size }));
      pendingUrlsRef.current = pendingMeta.map((m) => m.url);
      setMessages([...(opts.base ?? messages).filter((m) => !m.local), { key: "pending_upload", pendingUpload: true, role: "user", content: text, file_urls: pendingMeta.map((m) => m.url), file_meta: pendingMeta }]);
      const concurrency = Math.min(3, attachedFiles.length);
      let nextIndex = 0;
      const results = new Array(attachedFiles.length);
      const worker = async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= attachedFiles.length) return;
          const original = attachedFiles[index];
          setUploadStatus((current) => current ? { ...current, currentName: original.name } : current);
          const file = await compressImage(original); // smaller photo = much faster upload and analysis
          const result = await api.integrations.Core.UploadFile({ file });
          results[index] = result.file_url;
          if (isZipFile(original) && result.file_url) newZipUrls.push(result.file_url);
          setUploadStatus((current) => current ? { ...current, done: current.done + 1, currentName: null } : current);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      uploadedUrls.push(...results.filter(Boolean));
      attachedFiles.forEach((f, i) => { if (results[i]) fileMeta.push({ url: results[i], name: f.name, size: f.size }); });
      setUploadStatus({ phase: "analyzing", done: attachedFiles.length, total: attachedFiles.length });
    }

    let convoId = activeId;
    if (!convoId) {
      const convo = await api.entities.Conversation.create({ title: text ? (text.length > 40 ? text.slice(0, 40) + "…" : text) : "Uploaded files" });
      convoId = convo.id;
      setActiveId(convoId);
      loadConversations();
    }

    if (uploadedUrls.length && !isAdmin && !isPremium && !opts.editImage) {
      incrementFileCount(uploadedUrls.length);
      setUpgradeReason("upload");
      setLimitTypes([]);
      setUpgradeOpen(true);
    }

    const history = [...(opts.base ?? messages).filter((m) => !m.local), { role: "user", content: text, file_urls: uploadedUrls, ...(fileMeta.length ? { file_meta: fileMeta } : {}), ...(newZipUrls.length ? { zip_urls: newZipUrls } : {}) }];
    // ZIP mode: a ZIP project was attached now, or earlier in this chat. Only then does Xyron hand
    // back a complete ZIP; with no ZIP attached everything stays a normal reply.
    const zipSource = newZipUrls[0] || history.slice().reverse().find((m) => m.role === "user" && m.zip_urls?.length)?.zip_urls[0] || null;
    setMessages(history);
    // The real message is in place now; free the temporary local previews.
    pendingUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ignore */ } });
    pendingUrlsRef.current = [];
    if (attemptRef.current) attemptRef.current.registered = true;
    if (!opts.regenerate) {
      await api.entities.Message.create({ conversation_id: convoId, role: "user", content: text, file_urls: uploadedUrls, ...(fileMeta.length ? { file_meta: fileMeta } : {}), ...(newZipUrls.length ? { zip_urls: newZipUrls } : {}) });
      void touchConversation(convoId);
    }

    // A file sent with no words: don't guess. The file card stays in the chat and a row of options appears
    // (Test and run, Fix errors, Custom …). No AI call is made until the person picks one.
    if (attachedFiles.length && !text.trim() && !opts.editImage && !opts.regenerate) {
      setThinking(false);
      setUploadStatus(null);
      return;
    }

    // "Host this GitHub repo on Render": no AI call and no quota. Xryon answers with a hosting card that asks the
    // person to connect their Render account (once), then hosts the project and follows the deploy.
    const hostRepo = !opts.regenerate && !opts.editImage && !attachedFiles.length ? hostRequestFromText(text) : null;
    if (hostRepo) {
      let connected = false;
      try { connected = !!(await api.render.status()).connected; } catch { /* treated as not connected */ }
      const reply = connected
        ? `I can host **${hostRepo.owner}/${hostRepo.repo}** on Render for you. I read the repository and suggested the settings below. Check them, then tap **Host on Render**.`
        : `I can host **${hostRepo.owner}/${hostRepo.repo}** on Render for you. First, connect your Render account with Xryon below. You only do this once, and after that you can keep hosting more GitHub projects just by pasting their links here.`;
      const created = await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: reply, host_repo: hostRepo });
      void touchConversation(convoId);
      setMessages((cur) => [...cur, { role: "assistant", content: reply, key: `host_${Date.now()}`, id: created?.id ?? created?.item?.id, host_repo: hostRepo }]);
      setThinking(false);
      setUploadStatus(null);
      return;
    }

    // /textimage with nothing after it: say how to use it. No image is made and no quota is used.
    if ((isTextImage || isMemeImage || isPlainTextImage) && !String(command.arg || "").trim()) {
      const TEXTIMAGE_HELP = isMemeImage ? "Use /meme followed by top text and bottom text separated by |, or type /meme alone to open the meme builder." : isPlainTextImage ? "Use /text followed by the words you want on the image, or type /text alone to open the text image builder." : "Type the words you want on the image after /textimage. You can add colors too, for example:\n\n/textimage Dave Tech, background black, color gold";
      await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: TEXTIMAGE_HELP });
      void touchConversation(convoId);
      setMessages((cur) => [...cur, { role: "assistant", content: TEXTIMAGE_HELP }]);
      opts.onReply?.(TEXTIMAGE_HELP);
      return;
    }

    // "Who is your owner / who created you": fixed answer with a tappable
    // "Xyron Labs" link (opens the Xyron Labs card). No AI call, no quota use.
    if (!isImage && !command && uploadedUrls.length === 0 && isOwnerQuestion(text)) {
      await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: OWNER_REPLY });
      void touchConversation(convoId);
      setMessages((cur) => [...cur, { role: "assistant", content: OWNER_REPLY }]);
      opts.onReply?.(OWNER_REPLY);
      return;
    }

    // Vague "create a channel pic for me": ask for the details first (name, content, style) instead of
    // generating a random face. The form's answers come back as a normal, detailed image request.
    if (isImage && !command && !magic && !imageShortcut && !opts.editImage && !opts.regenerate && uploadedUrls.length === 0) {
      const askReply = imageDetailsAsk(text);
      if (askReply) {
        await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: askReply });
        void touchConversation(convoId);
        setMessages((cur) => [...cur, { role: "assistant", content: askReply }]);
        opts.onReply?.(askReply);
        return;
      }
    }

    // Memory commands ("remember that ...", "switch to project X"): handled locally, no AI call, no quota use.
    if (!isImage && !command && uploadedUrls.length === 0) {
      const mem = handleMemoryCommand(text);
      if (mem) {
        await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: mem.reply });
        void touchConversation(convoId);
        setMessages((cur) => [...cur, { role: "assistant", content: mem.reply }]);
        opts.onReply?.(mem.reply);
        return;
      }
    }

    let thread = history;
    // Rich preview for real-world entities: a skeleton shows at once, then the
    // card replaces it (or disappears if nothing reliable was found).
    let previewDone = null;
    const entityQuery = !isImage && !isVideo && !isDaveTechCommand(text) ? detectEntityQuery(text, { command, hasFiles: uploadedUrls.length > 0 }) : null;
    if (entityQuery) {
      const key = `pv_${Date.now()}`;
      setMessages(thread = [...history, { role: "assistant", content: "", preview: { status: "loading" }, key }]);
      previewDone = fetchEntityPreview(entityQuery).then(async (pv) => {
        if (!pv) { setMessages((cur) => cur.filter((m) => m.key !== key)); return; }
        let id = key;
        try {
          const created = await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: "", preview: pv });
          id = created?.id ?? created?.item?.id ?? key;
        } catch { /* preview still shows for this session */ }
        setMessages((cur) => cur.map((m) => (m.key === key ? { ...m, id, preview: pv } : m)));
      }).catch(() => setMessages((cur) => cur.filter((m) => m.key !== key)));
    }
    // Visual "A vs B" comparison card, same pattern as the entity preview:
    // a skeleton first, replaced by the two-sided card (or dropped if
    // neither side resolved to a real source).
    const comparisonQuery = !isImage && !entityQuery && !isDaveTechCommand(text) ? detectComparisonQuery(text, { command, hasFiles: uploadedUrls.length > 0 }) : null;
    if (comparisonQuery) {
      const key = `cmp_${Date.now()}`;
      setMessages(thread = [...history, { role: "assistant", content: "", comparison: { status: "loading" }, key }]);
      const cmpDone = fetchComparisonPreview(comparisonQuery).then(async (cmp) => {
        if (!cmp) { setMessages((cur) => cur.filter((m) => m.key !== key)); return; }
        let id = key;
        try {
          const created = await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: "", comparison: cmp });
          id = created?.id ?? created?.item?.id ?? key;
        } catch { /* card still shows for this session */ }
        setMessages((cur) => cur.map((m) => (m.key === key ? { ...m, id, comparison: cmp } : m)));
      }).catch(() => setMessages((cur) => cur.filter((m) => m.key !== key)));
      previewDone = previewDone ? previewDone.then(() => cmpDone) : cmpDone;
    }
    if (isVideo) {
      setUploadStatus(null);
      setThinking(true);
      try {
        const res = await api.functions.invoke("videoPlan", { request: text, file_urls: uploadedUrls, aspect: videoAspect(text) }, { signal: requestController.signal });
        const plan = res.data?.plan;
        if (!plan?.scenes?.length) throw new Error("empty video plan");
        const note = `Here is your video: **${plan.title}**. It is recorded right here in your browser (about ${Math.round(plan.scenes.reduce((a, s) => a + s.duration, 0))} seconds), so keep this tab open until it finishes, then tap Download.`;
        let id;
        try { const created = await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: note, video_plan: plan }); id = created?.id ?? created?.item?.id; } catch { /* the card still shows for this session */ }
        void touchConversation(convoId);
        setMessages(thread = [...history, { id, role: "assistant", content: note, video_plan: plan, fresh: true }]);
      } catch (e) {
        if (e?.name === "AbortError" || requestController.signal.aborted) { setThinking(false); return; }
        if (e?.status === 401 || /authentication required|not authenticated/i.test(e?.message || "")) { setThinking(false); requireAuthentication(); return; }
        console.error("Video plan failed:", e);
        const limit = e?.status === 429 || /video_limit/.test(e?.message || "");
        setMessages([...history, { role: "assistant", content: limit ? "You have used today's video limit. Upgrade to Plus for more videos, or try again tomorrow." : "I could not plan that video just now. Please try again in a moment." }]);
      }
      setThinking(false);
      return;
    }
    if (isImage) {
      const failImage = async () => {
        showError(new Error("Image generation failed"));
      };
      setImageLoading(true);
      setForge({
        prompt: (command?.cmd.command === "/image" || isTextImage) ? command.arg : text,
        regenerating: !!opts.regenerate,
        previousImageUrl: opts.previousImageUrl || null,
        // Wide shortcuts get a wide canvas so the final image does not cause a layout jump.
        ratio: imageShortcut?.[0] === "/wallpaper" ? 16 / 9 : 1,
      });
      try {
        const imagePrompt = opts.editImage
          ? `Edit the attached image according to this request: ${text}\n\nKeep the same character, pose, composition and art style unless the request says to change them. Return the edited image.`
          : imageShortcut
          ? (uploadedUrls.length && !text.trim().replace(imageShortcut[0], "").trim()
              ? `Transform the uploaded image into ${imageShortcut[1]} style. Preserve the main subject, identity, composition, and important visual details while applying a polished ${imageShortcut[1]} aesthetic.`
              : expandImagePrompt(text))
          : magic ? magic.imagePrompt : (command?.cmd.command === "/image" ? command.arg : text);

        // Personal-history image requests: only attach recent chat context when the user
        // explicitly asks for an image based on everything Xryon knows about them.
        // Saved memories remain user-controlled through Settings → Memory.
        const wantsPersonalHistoryImage = /\b(?:everything|all)\s+(?:you|xyron|xryon)\s+(?:know|remember)\s+about\s+me\b|\b(?:draw|create|make|generate|paint)\b.{0,70}\b(?:based on|using)\b.{0,35}\b(?:my|our)\s+(?:chat|conversation|history|memories)\b/i.test(String(text || ""));
        let finalImagePrompt = imagePrompt;
        if (wantsPersonalHistoryImage) {
          const recentUserHistory = (Array.isArray(history) ? history : [])
            .filter((m) => m?.role === "user" && !m.preview && !m.comparison)
            .slice(-30)
            .map((m) => String(m.content || "").trim().slice(0, 500))
            .filter(Boolean);
          const savedMemoryContext = buildMemoryPrompt();
          const personalContext = [
            "Create a thoughtful, visually rich illustration inspired by the user's known interests, projects, preferences, and themes. Use only the context below; do not invent personal facts. Represent abstract or uncertain details symbolically rather than adding identifying details.",
            savedMemoryContext ? `Saved user memories:\n${savedMemoryContext.slice(0, 7000)}` : "",
            recentUserHistory.length ? `Recent conversation history (user messages):\n${recentUserHistory.join("\n")}` : "",
          ].filter(Boolean).join("\n\n");
          finalImagePrompt = `${imagePrompt}\n\nPERSONAL HISTORY CONTEXT FOR THIS REQUEST:\n${personalContext}`;
        }
        // The person's own words (no style boilerplate) so the server can build a proper prompt.
        const subjectText = uploadedUrls.length ? "" : String(magic ? magic.imagePrompt : (command?.cmd.command === "/image" ? command.arg : text) || "").replace(/^\/\S+\s*/, "").trim();
        // Never hang: give up after 135 s (the server stops by itself after about 110 s).
        const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("Image request timed out")), ms))]);
        const chosenImageModel = getSetting("imageModel", "Xryon Ximage");
        let res;
        if (chosenImageModel === "Xryon Ximage" && !isMemeImage && !isPlainTextImage && !isTextImage) {
          const params = new URLSearchParams({
            prompt: finalImagePrompt,
            width: String(imageOptions.width || 1024),
            height: String(imageOptions.height || 1024),
            steps: String(imageOptions.steps || 30),
          });
          const response = await withTimeout(fetch(`https://prexzyapis.com/ai/genimage?${params.toString()}`, { signal: requestController.signal }), 135000);
          if (!response.ok) throw new Error(`Xryon Ximage request failed (${response.status})`);
          const payload = await response.json();
          const externalUrl = payload.url || payload.image_url || payload.image || payload.result?.url || payload.data?.url || payload.data?.image_url;
          res = { data: { ...payload, url: typeof externalUrl === "string" ? externalUrl : null } };
        } else {
          res = await withTimeout(isMemeImage
          ? api.functions.invoke("memeImage", { ...imageOptions, topText: imageOptions.topText || command.arg.split("|")[0]?.trim(), bottomText: imageOptions.bottomText || command.arg.split("|").slice(1).join("|").trim() })
          : isPlainTextImage
          ? api.functions.invoke("memeTextImage", { ...imageOptions, text: imageOptions.text || command.arg })
          : isTextImage ? api.functions.invoke("textImage", { text: command.arg }) : api.functions.invoke("generateImage", {
          prompt: finalImagePrompt,
          image_urls: uploadedUrls,
          source_image_urls: uploadedUrls,
          mode: uploadedUrls.length && (imageShortcut || opts.editImage) ? "image_to_image" : "text_to_image",
          shortcut: imageShortcut?.[0] || null,
          style: imageShortcut?.[1] || null,
          subject: subjectText,
        }, { signal: requestController.signal }), 135000);
        }
        const imageUrl = res.data?.url;
        if (imageUrl) {
          if (!isAdmin && !isPremium) recordImageQuotaUse();
          // /textimage comes with a short note that repeats what was asked for.
          const extras = isTextImage ? [res.data?.background && `background ${res.data.background}`, res.data?.color && `text color ${res.data.color}`].filter(Boolean) : [];
          const imageNote = isTextImage ? `Here is your image with the prompt you asked: \u201c${res.data?.text || String(command.arg).trim()}\u201d${extras.length ? ` (${extras.join(", ")})` : ""}.\n\nOpen it to change anything with \u201cDescribe edits\u201d, or send /textimage again with different colors.` : isMemeImage ? `Your meme is ready${imageOptions.topText ? `: “${imageOptions.topText}”` : ""}.` : isPlainTextImage ? `Your text image is ready: “${imageOptions.text || command.arg}”.` : "";
          await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: imageNote, file_urls: [imageUrl] });
          void touchConversation(convoId);
          // Decode the image first so the canvas hands over to the real image without a flash or layout jump.
          // Wait (up to 30 s) until the picture has fully downloaded, so the reveal animation never plays on a
          // half-loaded image (that is what showed only the top of the picture on slow connections).
          let loaded = false;
          await new Promise((resolve) => { const im = new Image(); const t = setTimeout(resolve, 30000); im.onload = () => { loaded = true; clearTimeout(t); resolve(); }; im.onerror = () => { clearTimeout(t); resolve(); }; im.src = imageUrl; });
          setMessages(thread = [...history, { role: "assistant", content: imageNote, file_urls: [imageUrl], fresh: loaded }]);
        } else {
          await failImage();
        }
      } catch (e) {
        if (e?.name === "AbortError" || requestController.signal.aborted) { setImageLoading(false); setUploadStatus(null); return; }
        if (e?.status === 401 || /authentication required|not authenticated/i.test(e?.message || "")) {
          setImageLoading(false);
          requireAuthentication();
          return;
        }
        // Never show the raw error: log it and show the error popup instead.
        console.error("Image request failed:", e);
        await failImage();
      }
      setImageLoading(false);
      setUploadStatus(null);
    }
    if (!isImage || magicText) {
      setUploadStatus(uploadedUrls.length ? { phase: "analyzing", done: attachedFiles.length, total: attachedFiles.length } : null);
      setThinking(true);
      if (!isAdmin && !isPremium) {
        if (isDocumentation) incrementDocumentationCount();
        else recordMessageQuotaUse();
      }
      // The answer is shown as it arrives in a bubble with this key, then replaced by the saved message.
      const liveKey = `live_${Date.now()}`;
      let liveText = "";
      const showLive = (txt) => {
        liveText = txt;
        if (activeIdRef.current !== convoId && activeIdRef.current != null) return;
        const shownText = txt.replace(/\[\[\s*images?\s*:[^\]]*(\]\])?/gi, "").replace(/\[\[?[^\]]*$/, "");
        setStreaming(true);
        setMessages((cur) => {
          const i = cur.findIndex((m) => m.key === liveKey);
          if (i < 0) return [...cur, { role: "assistant", content: shownText, key: liveKey }];
          const next = cur.slice();
          next[i] = { ...next[i], content: shownText };
          return next;
        });
      };
      // Live progress of a long REA investigation (plan, tool calls, checking). Shown in the same bubble until the real answer text starts.
      const trail = newTrail();
      let trailShown = false;
      const showTrail = (ev) => {
        applyStep(trail, ev);
        if (liveText || (activeIdRef.current !== convoId && activeIdRef.current != null)) return;
        trailShown = true;
        const md = trailMarkdown(trail);
        setStreaming(true);
        setMessages((cur) => {
          const i = cur.findIndex((m) => m.key === liveKey);
          if (i < 0) return [...cur, { role: "assistant", content: md, key: liveKey }];
          const next = cur.slice();
          next[i] = { ...next[i], content: md };
          return next;
        });
      };
      try {
        const smallTalk = !uploadedUrls.length && !zipSource && !command && isSmallTalk(text);
        // Any code request (build, fix, change, pasted code, a follow-up change to a project built earlier) works like the Codex studio: it goes to the Xyron Nexus coding model whichever model is selected,
        // and the answer comes back as a project (plan + every file) shown as one ZIP card.
        const buildMode = !zipSource && !command && !magic && !smallTalk && (wantsBuild(text, attachedFiles.map((f) => f?.name)) || isBuildFollowUp(text, history.slice(0, -1)));
        // Coding rules (agent / multi-file / notes) go out only for real code requests; other messages get the general prompt.
        const codingOn = needsCodingPrompts({
          text,
          fileNames: attachedFiles.map((f) => f?.name),
          history: history.slice(0, -1),
          forced: buildMode || !!zipSource || !!command || !!magic || wantsCode(text) || wantsZipDownload(text),
        });
        const chatPayload = {
          messages: history.filter((m) => !m.preview && !m.comparison).map((m) => ({ role: m.role, content: m.role === "user" ? (stripCommand(m.content) || (m.file_urls?.length ? `(Attached file: ${attachmentsOf(m).map((a) => a.name).join(", ")})` : "")) : m.content })),
          conversation_id: convoId,
          zip_source: zipSource || undefined,
          // "Web search" switch: look every question up live (not for small talk or ZIP projects).
          web_search: isWebSearchOn() && !smallTalk && !zipSource ? true : undefined,
          persona: getSetting("persona", "concise"),
          ui_model: getSetting("selectedModel", DEFAULT_FREE_MODEL),
          codex_build: buildMode ? true : undefined,
          xyron_mode: getSetting("xyronMode", "auto"),
          system_prompt: [
            XYRON_PERSONA_PROMPT,
            XYRON_IDENTITY_PROMPT,
            XYRON_CASUAL_PROMPT,
            XYRON_RESPONSE_STYLE_PROMPT,
            codingOn ? XYRON_AGENT_PROMPT : XYRON_GENERAL_PROMPT,
            codingOn ? XYRON_MULTI_FILE_PROMPT : "",
            codingOn ? XYRON_FILE_NOTES_PROMPT : "",
            getSetting("systemPrompt", ""),
            buildMemoryPrompt(),
            XMODE_PROMPTS[getSetting("xyronMode", "auto")],
            command?.cmd.kind === "mode" ? command.cmd.prompt : "",
            magic ? magic.prompt : "",
            zipSource ? XYRON_ZIP_PROMPT : XYRON_NO_ZIP_PROMPT,
            !zipSource && !command && visualQueryFromText(text, history) ? (isRichCardsOn() ? XYRON_IMAGE_GUIDE_PROMPT : XYRON_IMAGES_SHOWN_PROMPT) : "",
            !buildMode && !zipSource && !command && wantsCode(text) ? XYRON_CODING_PROMPT : "",
            !buildMode && !zipSource && !command && wantsZipDownload(text) ? XYRON_ZIP_REQUEST_PROMPT : "",
            !buildMode && !zipSource && !command && wantsNames(text) ? namingPrompt(isRichCardsOn()) : "",
            buildMode ? XYRON_BUILD_PROMPT : "",
            zipSource || command ? "" : XYRON_IMAGE_PROMPT,
            XYRON_IMAGE_ABILITY_PROMPT,
            zipSource || command ? "" : (isRichCardsOn() && !buildMode ? XYRON_RICH_PROMPT : XYRON_NO_CARDS_PROMPT),
            smallTalk ? XYRON_SHORT_REPLY_PROMPT : "",
            isJoyfulOn() ? JOYFUL_PROMPT : "",
          ].filter(Boolean).join("\n\n"),
          // New attachments win; otherwise keep using the most recent image in the
          // conversation so follow-up questions about it still work.
          file_urls: [...new Set([
            ...(uploadedUrls.length ? uploadedUrls : history.filter((m) => m.role === "user" && m.file_urls?.length).flatMap((m) => m.file_urls).slice(-4)),
            ...(zipSource ? [zipSource] : []),
          ])],
        };
        let res;
        // Automatic routing for attachments, whichever model is selected (no switching needed):
        //  - a new picture goes to the vision model (ChatArt vision, which also remembers the picture for follow-ups)
        //  - a document (pdf, docx, xlsx, csv, txt, code ...) goes to the main chat, where the server's file reader turns it into text
        // A picture together with a document, and ZIP projects, also stay on the main chat (it reads both).
        const selectedModel = getSetting("selectedModel", DEFAULT_FREE_MODEL);
        const fileKindsNow = (uploadedUrls.length
          ? attachedFiles.map((f) => (/^image\//i.test(f?.type || "") ? "image" : fileKind(f?.name)))
          : (history.filter((m) => m.role === "user" && m.file_urls?.length).slice(-1).flatMap((m) => attachmentsOf(m).map((a) => a.kind))));
        const newImageNow = uploadedUrls.length > 0 && fileKindsNow.includes("image");
        const docNow = fileKindsNow.some((k) => k !== "image" && k !== "zip");
        const autoVision = !buildMode && !zipSource && newImageNow && !docNow;
        const keepOnMain = docNow && !autoVision; // a document is in play: the main chat reads it
        if (!buildMode && !keepOnMain && !autoVision && selectedModel === "Xryon Basic") {
          const params = new URLSearchParams({
            prompt: chatPayload.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
            state: "",
            media: JSON.stringify(chatPayload.file_urls || []),
            model: "gpt-5",
            web_search: String(!!chatPayload.web_search),
          });
          const response = await fetch(`https://prexzyapis.com/ai/askgpt5?${params.toString()}`, { signal: requestController.signal });
          if (!response.ok) throw new Error(`Xryon Basic request failed (${response.status})`);
          const payload = await response.json();
          const reply = payload.reply || payload.response || payload.answer || payload.message || payload.content || payload.data?.reply || payload.data?.response;
          res = { data: { ...payload, reply: typeof reply === "string" ? reply : "" } };
        } else if (autoVision || (!buildMode && !keepOnMain && CHARART_MODEL_MODES[selectedModel])) {
          // ChatArt (v6 / v5 / vision). new_image_urls tells the server which picture is new in THIS message;
          // otherwise it keeps using the picture it remembers for this conversation.
          res = await api.functions.invoke("charartChat", {
            messages: chatPayload.messages,
            conversation_id: convoId,
            mode: autoVision ? "vision" : CHARART_MODEL_MODES[selectedModel],
            new_image_urls: uploadedUrls,
            file_urls: chatPayload.file_urls,
          }, { signal: requestController.signal });
        } else {
          res = await streamMainChat(chatPayload, { signal: requestController.signal, onText: showLive, onStep: showTrail });
        }
        let rawReply = res.data?.reply;
        if (!rawReply) throw new Error("Empty reply from the server");
        if (previewDone) await previewDone;
        // Visual answers: strip the hidden [[images: ...]] line and decide whether to add a gallery.
        // Never for ZIP work, commands, or when a preview/comparison card already covers the topic
        // (unless the person explicitly asked for pictures).
        const tagged = extractImageTag(rawReply);
        const reply = tagged.text || rawReply.replace(/\[\[\s*images?\s*:[^\]]*\]\]/gi, "").trim();
        const explicitReq = imageRequestFromText(text, history);
        const explicitQuery = explicitReq?.query || null;
        const imageQuery = buildMode || zipSource || command || !reply || hasRichList(reply) || hasRichPicks(reply) || hasRichImages(reply) || hasRichDoc(reply) ? null : (explicitQuery || (!entityQuery && !comparisonQuery ? tagged.query : null));
        const msgKey = liveText || trailShown ? liveKey : `ai_${Date.now()}`;
        const webSources = Array.isArray(res.data?.webSearch?.sources) && res.data.webSearch.sources.length ? res.data.webSearch.sources : null;
        const created = res.data?.savedMessageId ? { id: res.data.savedMessageId } : await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: reply, ...(zipSource ? { zip_source: zipSource } : {}), ...(webSources ? { sources: webSources } : {}) });
        const msgId = created?.id ?? created?.item?.id;
        void touchConversation(convoId);
        if (activeIdRef.current === convoId || activeIdRef.current == null) setMessages((cur) => { const item = { role: "assistant", content: reply, key: msgKey, id: msgId, ...(webSources ? { sources: webSources } : {}), ...(zipSource ? { zip_source: zipSource } : {}), ...(imageQuery ? { images: { status: "loading", query: imageQuery, items: [] } } : {}) }; const at = cur.findIndex((m) => m.key === msgKey); if (at < 0) return [...cur, item]; const next = cur.slice(); next[at] = item; return next; });
        if (imageQuery) void loadGallery(msgKey, msgId, imageQuery, explicitQuery ? explicitReq.page : 1);
        setStreaming(false);
        opts.onReply?.(reply);
      } catch (e) {
        setStreaming(false);
        if (e?.name === "AbortError" || requestController.signal.aborted) {
          // Stop pressed while the answer was being written: keep what was already shown and save it.
          if (liveText.trim()) {
            const partial = liveText.replace(/\[\[\s*images?\s*:[^\]]*(\]\])?/gi, "").replace(/\[\[?[^\]]*$/, "").trim();
            if (partial) { try { await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: partial }); } catch { /* the text is still on screen */ } }
          }
          if (previewDone) await previewDone; setThinking(false); setUploadStatus(null); return;
        }
        setMessages((cur) => cur.filter((m) => m.key !== liveKey)); // drop the half-written bubble before showing the error
        if (previewDone) await previewDone;
        if (e?.status === 401 || /authentication required|not authenticated/i.test(e?.message || "")) {
          setThinking(false);
          setUploadStatus(null);
          requireAuthentication();
          return;
        }
        // Never put a raw backend error in the chat: log it and show the popup.
        showError(e);
        opts.onReply?.("Sorry, something went wrong. Please try again.");
        return;
      }
      setThinking(false);
      setUploadStatus(null);
    } else {
      setUploadStatus(null);
    }
  };

  const isEmptyChat = messages.length === 0 && !thinking && !imageLoading && !uploadStatus;

  // PC: the box sits in the middle of an empty chat; once chatting it glides down to the bottom.
  const wasEmpty = useRef(isEmptyChat);
  const [settling, setSettling] = useState(false);

  // Phones: the box lives at the bottom of the screen from the start (CSS), so there is nothing to glide on first send.
  const phoneLayout = () => typeof window !== "undefined" && (window.matchMedia?.("(max-width: 767px)").matches ?? false);

  useEffect(() => {
    if (wasEmpty.current && !isEmptyChat) {
      if (phoneLayout()) { wasEmpty.current = false; return undefined; }
      setSettling(true);
      const t = setTimeout(() => setSettling(false), 500);
      wasEmpty.current = false;
      return () => clearTimeout(t);
    }
    wasEmpty.current = isEmptyChat;
  }, [isEmptyChat]);

  // Files sent without words wait for the person to choose what to do (this also survives a reload).
  const lastMsg = messages[messages.length - 1];
  const idle = !thinking && !imageLoading && !uploadStatus;
  const pendingFiles = Boolean(idle && lastMsg?.role === "user" && lastMsg.file_urls?.length && !String(lastMsg.content || "").trim()) ? attachmentsOf(lastMsg) : null;
  // A task that stopped: nothing came back for the last message, or the reply broke off in the middle of a code block.
  const brokeOff = lastMsg?.role === "assistant" && !lastMsg.preview && !lastMsg.comparison && ((String(lastMsg.content || "").match(/```/g) || []).length % 2 === 1);
  const unanswered = Boolean(lastMsg?.role === "user" && !pendingFiles && String(lastMsg.content || "").trim());
  const canContinue = Boolean(idle && !pendingFiles && (brokeOff || unanswered));
  const continueTask = () => {
    if (unanswered) { regenerate(); return; }
    send("Continue from exactly where you stopped. Don't repeat what you already wrote.", [], {});
  };

  const openPremium = () => {
    if (isPremium) { navigate("/premium"); return; }
    setLimitTypes([]); setUpgradeReason("upload"); setUpgradeOpen(true);
  };

  return (
    <div className="xyron-chat-shell relative min-h-screen bg-black text-neutral-100 selection:bg-white selection:text-black xyron-safe-x">
      <div className="xyron-ambient-graphics" aria-hidden="true"><span className="xyron-graphic graphic-a" /><span className="xyron-graphic graphic-b" /><span className="xyron-graphic graphic-c" /></div>
      <Sidebar conversations={conversations} activeId={activeId} onSelect={openConversation} onNew={newChat} onDelete={deleteConversation} onRename={renameConversation} open={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopOpen={desktopSidebarOpen} onToggleDesktop={() => setDesktopSidebarOpen((current) => !current)} onHelp={() => setHelpOpen(true)} />

      <div className={`relative flex min-h-screen flex-col transition-[padding] duration-200 ${desktopSidebarOpen ? "md:pl-[var(--xs-sw,18rem)]" : "md:pl-0"}`}>
        <header className="xyron-safe-top sticky top-0 z-40 flex items-center justify-between bg-black px-3 py-2 md:hidden">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className={headerBareBtn}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M4 8h16M4 15h10" /></svg>
          </button>
          <button type="button" onClick={() => setCtxMenuOpen((open) => !open)} className={headerBareBtn} title="More" aria-label="More options" aria-haspopup="menu" aria-expanded={ctxMenuOpen}><MoreVertical className="h-6 w-6" strokeWidth={1.75} /></button>
        </header>

        {!isEmptyChat && <header className="xs-topbar sticky top-0 z-40 hidden items-center justify-between gap-2 border-b border-white/15 bg-black px-4 py-3 md:flex">
          <button type="button" onClick={() => setDesktopSidebarOpen((current) => !current)} aria-label={desktopSidebarOpen ? "Close history sidebar" : "Open history sidebar"} title={desktopSidebarOpen ? "Close history sidebar" : "Open history sidebar"} className={headerIconBtn}>{desktopSidebarOpen ? <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={2} /> : <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={2} />}</button>
          <ModelSwitcher isPremium={!!isPremium} isAdmin={!!isAdmin} />
          <div className="ml-auto flex items-center gap-2">
          {isAdmin ? <span className="rounded-full border border-white/25 bg-[#232326] px-4 py-2 text-xs font-medium text-white">Admin • unlimited access</span> : <button type="button" onClick={openPremium} className={headerPillBtn}><Sparkles className="h-4 w-4" strokeWidth={2.4} /> Premium</button>}
          <button type="button" onClick={() => setHelpOpen(true)} className={headerPillBtn}><LifeBuoy className="h-4 w-4" strokeWidth={2.4} /> Help</button>
          <button type="button" onClick={() => setCtxMenuOpen((open) => !open)} className={headerIconBtn} title="More" aria-label="More options" aria-haspopup="menu" aria-expanded={ctxMenuOpen}><MoreVertical className="h-[18px] w-[18px]" strokeWidth={2} /></button>
          </div>
        </header>}

        {isEmptyChat && <button type="button" onClick={() => setDesktopSidebarOpen((current) => !current)} aria-label={desktopSidebarOpen ? "Close sidebar" : "Open sidebar"} aria-pressed={desktopSidebarOpen} title={`${desktopSidebarOpen ? "Close" : "Open"} sidebar (Ctrl+B)`} className={`xs-icon xs-float-toggle fixed top-3 z-30 hidden h-9 w-9 place-items-center rounded-xl border border-white/15 bg-[#151518] text-neutral-300 shadow-lg transition-[left,background-color] duration-200 hover:bg-[#222225] hover:text-white md:grid ${desktopSidebarOpen ? "left-[calc(var(--xs-sw,18rem)+1rem)]" : "left-3"}`}><PanelLeft className="h-4 w-4" /></button>}
        {isEmptyChat && <ModelSwitcher isPremium={!!isPremium} isAdmin={!!isAdmin} className={`fixed top-3 z-30 hidden md:block ${desktopSidebarOpen ? "left-[calc(var(--xs-sw,18rem)+4rem)]" : "left-16"}`} />}

        <main className={`xyron-chat-main flex-1 ${isEmptyChat ? "md:min-h-screen" : ""}`}>
          {isEmptyChat ? (
            <div aria-hidden="true" className="min-h-[calc(100dvh-5rem)] md:min-h-screen" />
          ) : <div className="xyron-message-list xyron-column mx-auto w-full max-w-3xl space-y-5 px-3 py-6 sm:px-5 sm:py-10">{messages.map((m, i) => <MessageBubble key={m.key || m.id || i} role={m.role} content={m.content} file_urls={m.file_urls} file_meta={m.file_meta} preview={m.preview} comparison={m.comparison} images={m.images} sources={m.sources} hostRepo={m.host_repo} videoPlan={m.video_plan} fresh={m.fresh} zipSource={m.zip_source} onRetryImages={() => loadGallery(m.key || m.id, m.id, m.images?.query)} local={m.local} loading={!!m.pendingUpload || (!!uploadStatus && m.role === "user" && i === messages.length - 1 && !!m.file_urls?.length)} isLast={i === messages.length - 1} onRegenerate={regenerate} regenerateDisabled={thinking || imageLoading} onSend={(t) => send(t, [], {})} onEditImage={editImageFromViewer} editDisabled={thinking || imageLoading} />)}{uploadStatus && uploadStatus.phase !== "uploading" && <div role="status" aria-live="polite" className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs text-neutral-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />{uploadStatus.phase === "uploading" ? `Uploading files ${uploadStatus.done}/${uploadStatus.total}${uploadStatus.currentName ? ` · ${uploadStatus.currentName}` : ""}…` : uploadStatus.phase === "analyzing" ? "Files uploaded · preparing AI analysis…" : "Files ready · Xyron is analyzing and preparing a reply…"}</div>}{pendingFiles && <FileActions items={pendingFiles} options={optionsFor(pendingFiles)} onPick={(prompt) => send(withFile(prompt, pendingFiles), [], {})} onCustom={(t) => send(customWithFile(t, pendingFiles), [], {})} />}{canContinue && <ContinueChip onContinue={continueTask} />}<RedOrb active={thinking && !streaming} /><ImageForge active={imageLoading} regenerating={forge.regenerating} previousImageUrl={forge.previousImageUrl} ratio={forge.ratio} /><div ref={endRef} /></div>}
        </main>

        {isEmptyChat && (
          <div aria-label="Welcome to Xyron" className={`xyron-empty-welcome pointer-events-none fixed inset-x-0 top-0 z-30 flex items-end justify-center px-4 text-center ${desktopSidebarOpen ? "md:left-[var(--xs-sw,18rem)]" : ""}`}>
            <div className="xs-greet flex items-center justify-center gap-2.5 md:gap-3">
                <Sparkles className="xs-greet-ico h-6 w-6 shrink-0 text-white md:h-8 md:w-8" strokeWidth={1.75} />
                <h1 className="font-display text-2xl tracking-tight text-white sm:text-3xl md:text-4xl"><span className="md:hidden">{greeting}</span><span className="hidden md:inline"><TypeGreeting name={firstName} greeting={greeting} userKey={authUser?.id || authUser?.email || "guest"} /></span></h1>
            </div>
          </div>
        )}

        <div className={`xyron-safe-bottom xyron-composer-dock ${isEmptyChat ? `xyron-empty-composer fixed inset-x-0 z-40 ${desktopSidebarOpen ? "md:left-[var(--xs-sw,18rem)]" : ""}` : "sticky bottom-0 bg-black pt-4"} ${settling ? "xyron-dock-settle" : ""}`}>
          {!isEmptyChat && showJump && (
            <button type="button" onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })} aria-label="Scroll to latest message" className="absolute -top-11 left-1/2 z-10 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-white/20 bg-black text-white shadow-lg shadow-black/50 transition hover:bg-neutral-900 active:scale-95">
              <ArrowDown className="h-4 w-4" strokeWidth={2.25} />
            </button>
          )}
          <div className="xyron-column mx-auto w-full max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            <Composer onSend={send} uploadStatus={uploadStatus} disabled={thinking || imageLoading || !!uploadStatus} onStop={stopGeneration} onClearChat={newChat} onRegenerate={regenerate} onExport={exportChat} onShare={shareChat} onOpenHistory={() => setSidebarOpen(true)} onAction={runAction} onVoiceChat={() => setVoiceOpen(true)} />
            {(isPremium || isAdmin) && <p className="mt-3 text-center text-[11px] text-neutral-600">{isAdmin ? "Admin access • unlimited service usage." : "Xyron can make mistakes. Verify important information."}</p>}
          </div>
        </div>
      </div>

      {imageCommandModal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setImageCommandModal(null); }}>
        <form onSubmit={(e) => { e.preventDefault(); const kind = imageCommandModal; const payload = kind === "meme" ? memeFields : textFields; const missing = kind === "meme" ? (!payload.topText.trim() || !payload.bottomText.trim()) : !payload.text.trim(); if (missing) return; setImageCommandModal(null); send(`/${kind} ${JSON.stringify(payload)}`, [], {}); }} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/15 bg-[#111113] p-5 text-white shadow-2xl sm:p-6">
          <div className="mb-1 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.22em] text-neutral-500">Xyron image tools</p><h2 className="mt-1 text-xl font-semibold">{imageCommandModal === "meme" ? "Meme maker" : "Text-only image"}</h2></div><button type="button" onClick={() => setImageCommandModal(null)} className="rounded-xl border border-white/10 px-3 py-2 text-neutral-400 hover:bg-white/10" aria-label="Close">✕</button></div>
          <p className="mb-5 text-sm text-neutral-400">{imageCommandModal === "meme" ? "Add top and bottom captions. Optional styling fields are available if you want them." : "Make a clean image from your words. Leave size and style blank to use the defaults."}</p>
          <div className="grid gap-4 sm:grid-cols-2">{(imageCommandModal === "meme" ? [["topText","Top text *"],["bottomText","Bottom text *"],["backgroundImage","Background image URL (optional)"],["fontFamily","Font family (optional)"],["textColor","Text color (optional)"],["strokeColor","Outline color (optional)"]] : [["text","Text *"],["width","Width (optional)"],["height","Height (optional)"],["fontFamily","Font family (optional)"],["textColor","Text color (optional)"],["strokeColor","Outline color (optional)"]]).map(([key,label]) => <label key={key} className="grid gap-1.5 text-sm text-neutral-300">{label}<input value={(imageCommandModal === "meme" ? memeFields : textFields)[key]} onChange={(e) => (imageCommandModal === "meme" ? setMemeFields : setTextFields)((old) => ({...old,[key]:e.target.value}))} required={label.includes("*")} type={key === "width" || key === "height" ? "number" : "text"} min={key === "width" || key === "height" ? 1 : undefined} max={key === "width" || key === "height" ? 4096 : undefined} placeholder={key === "topText" ? "When the code finally works…" : key === "bottomText" ? "It was one missing semicolon" : key === "text" ? "Dave Tech" : "Optional"} className="w-full rounded-xl border border-white/10 bg-[#1d1d20] px-3 py-3 text-white outline-none placeholder:text-neutral-600 focus:border-white/30" /></label>)}</div>
          <button type="submit" className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 font-semibold text-white transition hover:brightness-110"><Sparkles className="h-4 w-4"/> Generate image</button>
        </form>
      </div>}
      <ContextMenu open={ctxMenuOpen} onClose={() => setCtxMenuOpen(false)} onClearChat={newChat} onShare={shareChat} onExport={exportChat} onHelp={() => setHelpOpen(true)} onPremium={isAdmin ? undefined : openPremium} onModel={() => navigate("/settings?tab=model")} onFeedback={() => setFeedbackKind("feedback")} onReportBug={() => setFeedbackKind("bug")} hasMessages={messages.length > 0} />
      <AuthRequiredModal open={authRequiredOpen} onClose={() => setAuthRequiredOpen(false)} />
      <LimitUpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reached={limitTypes} uploaded={upgradeReason === "upload"} />
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
      <FeedbackModal open={feedbackKind !== null} kind={feedbackKind || "feedback"} onClose={() => setFeedbackKind(null)} />
      <QuotaModal open={quotaModalOpen} onClose={() => setQuotaModalOpen(false)} kind={quotaKind} />
      <ErrorPopup open={errorOpen} onClose={() => setErrorOpen(false)} onContinue={retryLast} canUpgrade={!isAdmin && !isPremium} />
      <ChatPausedModal open={pausedOpen} onClose={() => setPausedOpen(false)} resetAt={pausedResetAt} onNewChat={() => { setPausedOpen(false); newChat(); }} />
      <VoiceChat
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onSend={(text, voiceOpts = {}) => send(text, voiceOpts.files || [], voiceOpts)}
        onNewChat={newChat}
        onOpenHistory={() => { if (window.matchMedia?.("(min-width: 768px)").matches) setDesktopSidebarOpen(true); else setSidebarOpen(true); }}
        onOpenConversation={openConversation}
        userName={authUser?.full_name || authUser?.name || ""}
        recent={[...conversations].filter(Boolean).sort((a, b) => String(b.updated_date || b.created_date || "").localeCompare(String(a.updated_date || a.created_date || ""))).slice(0, 3).map((c) => ({ id: c.id, title: c.title || "Untitled chat" }))}
      />
    </div>
  );
}




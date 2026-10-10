import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Menu, MoreVertical, Sparkles, LifeBuoy, PanelLeftClose, PanelLeftOpen, PanelLeft } from "lucide-react";
import Sidebar from "../components/xyron/Sidebar";
import MessageBubble from "../components/xyron/MessageBubble";
import Composer from "../components/xyron/Composer";
import { expandImagePrompt, getImageShortcut } from "../components/xyron/ImageShortcuts";
import { detectEntityQuery, fetchEntityPreview } from "../lib/entityPreview";
import { detectComparisonQuery, fetchComparisonPreview } from "../lib/comparison";
import { parseCommand, stripCommand, XMODE_PROMPTS } from "../lib/commands";
import { XYRON_PERSONA_PROMPT, XYRON_IDENTITY_PROMPT, XYRON_RESPONSE_STYLE_PROMPT, XYRON_MULTI_FILE_PROMPT, XYRON_FILE_NOTES_PROMPT, XYRON_AGENT_PROMPT } from "../lib/persona";
import { isOwnerQuestion, OWNER_REPLY } from "../lib/xyronLabs";
import { XYRON_IMAGE_PROMPT, extractImageTag, visualQueryFromText } from "../lib/imageSearch";
import { isZipFile, XYRON_ZIP_PROMPT, XYRON_NO_ZIP_PROMPT } from "../lib/zipMode";
import RedOrb from "../components/xyron/RedOrb";
import { useAuth } from "../lib/AuthContext";
import ImageForge from "../components/xyron/ImageForge";
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
import {
  getSetting,
  getCurrentUser,
  checkPremium,
  isImageRequest,
  isDocumentationRequest,
  getDailyFileCount,
  incrementFileCount,
  getDailyDocumentationCount,
  incrementDocumentationCount,
  FREE_FILE_LIMIT,
  FREE_DOCUMENTATION_LIMIT,
  FREE_MESSAGE_QUOTA,
  FREE_IMAGE_QUOTA,
  isMessageQuotaExceeded,
  isImageQuotaExceeded,
  recordMessageQuotaUse,
  recordImageQuotaUse,
  getMessageQuota,
  getImageQuota,
  getQuotaResetClockTime,
  getDailyResetClockTime,
} from "../lib/settings";

// Header buttons: solid and thick on purpose (no see-through backgrounds).
const headerIconBtn = "grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/25 bg-[#232326] text-white shadow-md shadow-black/50 transition hover:bg-[#2f2f33] active:scale-95";
const headerPillBtn = "flex h-10 items-center gap-2 rounded-xl border border-white/25 bg-[#232326] px-4 text-sm font-medium text-white shadow-md shadow-black/50 transition hover:bg-[#2f2f33] active:scale-95";

export default function Chat() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [forge, setForge] = useState({ prompt: "", regenerating: false, previousImageUrl: null });
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  // Opening a saved chat from history jumps straight to its latest message.
  const jumpOnOpen = useRef(false);
  useEffect(() => { if (jumpOnOpen.current) { jumpOnOpen.current = false; endRef.current?.scrollIntoView({ behavior: "auto" }); } }, [messages]);

  const openConversation = async (id) => {
    setActiveId(id);
    setSidebarOpen(false);
    try {
      const saved = await api.entities.Message.filter({ conversation_id: id }, "created_date");
      jumpOnOpen.current = true;
      setMessages(saved);
    } catch (e) {
      console.error("Could not open conversation:", e);
      showError(e);
    }
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
      notify(isAdmin || isPremium
        ? `**Status**\n\n- Messages in this chat: ${real.length}\n- Plan: ${isAdmin ? "Admin (unlimited)" : "Premium"}`
        : `**Status**\n\n- Messages in this chat: ${real.length}\n- Left in this 4h window: ${Math.max(0, FREE_MESSAGE_QUOTA - getMessageQuota().count)} questions, ${Math.max(0, FREE_IMAGE_QUOTA - getImageQuota().count)} images\n- Left today: ${Math.max(0, FREE_FILE_LIMIT - getDailyFileCount())} files, ${Math.max(0, FREE_DOCUMENTATION_LIMIT - getDailyDocumentationCount())} docs`);
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

  // Edit a message of yours: everything from it onward (including the AI's answer) is deleted,
  // then the edited text is sent again as a fresh question in the same chat.
  const editAndResend = async (index, newText) => {
    if (thinking || imageLoading || uploadStatus) return;
    const target = messages[index];
    if (!target || target.role !== "user") return;
    const doomed = messages.slice(index);
    const base = messages.slice(0, index).filter((m) => !m.local);
    setMessages(base);
    for (const m of doomed) if (m.id) { try { await api.entities.Message.delete(m.id); } catch { /* ignore */ } }
    send(newText, [], { base, fileUrls: target.file_urls || [], zipUrls: target.zip_urls || [], reuseFiles: true });
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

  const send = async (text, attachedFiles = [], opts = {}) => {
    attemptRef.current = { text, attachedFiles, opts, registered: false };
    try {
      await runSend(text, attachedFiles, opts);
    } catch (e) {
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
  const loadGallery = async (msgKey, msgId, query) => {
    const patch = (images) => setMessages((cur) => cur.map((m) => ((m.key || m.id) === msgKey ? { ...m, images } : m)));
    patch({ status: "loading", query, items: [] });
    try {
      const res = await api.images.search(query, 8);
      const items = Array.isArray(res?.images) ? res.images : [];
      if (!items.length) { patch(undefined); return; }
      patch({ status: "ready", query, items });
      if (msgId) { try { await api.entities.Message.update(msgId, { images: { query, items } }); } catch { /* gallery still shows for this session */ } }
    } catch (e) {
      console.error("Image search failed:", e);
      patch({ status: "error", query, items: [] });
    }
  };

  const runSend = async (text, attachedFiles = [], opts = {}) => {
    // The chat UI can be viewed while signed out, but actual AI requests and
    // account-based history require a signed-in Xyron account. Check here so
    // users get the friendly auth popup instead of a raw "Authentication required" error.
    try {
      await api.auth.me();
    } catch {
      requireAuthentication();
      return;
    }

    const command = parseCommand(text, attachedFiles);
    if (isAdmin) {
      // Admin accounts have unlimited access and never need Premium.
    }

    const magic = command?.cmd.kind === "magic" ? command.plan : null;
    const magicText = !!magic?.text;
    const isImage = opts.editImage ? true : magic ? magic.image : (isImageRequest(text) || command?.cmd.command === "/image");
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
    const newZipUrls = [...(opts.zipUrls || [])]; // ZIP projects attached to THIS message
    if (attachedFiles.length) {
      setUploadStatus({ phase: "uploading", done: 0, total: attachedFiles.length });
      const concurrency = Math.min(3, attachedFiles.length);
      let nextIndex = 0;
      const results = new Array(attachedFiles.length);
      const worker = async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= attachedFiles.length) return;
          const file = attachedFiles[index];
          setUploadStatus((current) => current ? { ...current, currentName: file.name } : current);
          const result = await api.integrations.Core.UploadFile({ file });
          results[index] = result.file_url;
          if (isZipFile(file) && result.file_url) newZipUrls.push(result.file_url);
          setUploadStatus((current) => current ? { ...current, done: current.done + 1, currentName: null } : current);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      uploadedUrls.push(...results.filter(Boolean));
      setUploadStatus({ phase: "analyzing", done: attachedFiles.length, total: attachedFiles.length });
    }

    let convoId = activeId;
    if (!convoId) {
      const convo = await api.entities.Conversation.create({ title: text ? (text.length > 40 ? text.slice(0, 40) + "…" : text) : "Uploaded files" });
      convoId = convo.id;
      setActiveId(convoId);
      loadConversations();
    }

    if (uploadedUrls.length && !isAdmin && !isPremium && !opts.editImage && !opts.reuseFiles) {
      incrementFileCount(uploadedUrls.length);
      setUpgradeReason("upload");
      setLimitTypes([]);
      setUpgradeOpen(true);
    }

    const userKey = `u_${Date.now()}`;
    const history = [...(opts.base ?? messages).filter((m) => !m.local), { role: "user", key: userKey, content: text, file_urls: uploadedUrls, ...(newZipUrls.length ? { zip_urls: newZipUrls } : {}) }];
    // ZIP mode: a ZIP project was attached now, or earlier in this chat. Only then does Xyron hand
    // back a complete ZIP; with no ZIP attached everything stays a normal reply.
    const zipSource = newZipUrls[0] || history.slice().reverse().find((m) => m.role === "user" && m.zip_urls?.length)?.zip_urls[0] || null;
    setMessages(history);
    if (attemptRef.current) attemptRef.current.registered = true;
    if (!opts.regenerate) {
      const savedUser = await api.entities.Message.create({ conversation_id: convoId, role: "user", content: text, file_urls: uploadedUrls, ...(newZipUrls.length ? { zip_urls: newZipUrls } : {}) });
      const savedUserId = savedUser?.id ?? savedUser?.item?.id;
      // remember the saved id so this message can be edited / removed later in the same session
      if (savedUserId) { history[history.length - 1].id = savedUserId; setMessages((cur) => cur.map((m) => (m.key === userKey ? { ...m, id: savedUserId } : m))); }
      void touchConversation(convoId);
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

    let thread = history;
    // Rich preview for real-world entities: a skeleton shows at once, then the
    // card replaces it (or disappears if nothing reliable was found).
    let previewDone = null;
    const entityQuery = !isImage ? detectEntityQuery(text, { command, hasFiles: uploadedUrls.length > 0 }) : null;
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
    const comparisonQuery = !isImage && !entityQuery ? detectComparisonQuery(text, { command, hasFiles: uploadedUrls.length > 0 }) : null;
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
    if (isImage) {
      const failImage = async () => {
        showError(new Error("Image generation failed"));
      };
      setImageLoading(true);
      setForge({
        prompt: command?.cmd.command === "/image" ? command.arg : text,
        regenerating: !!opts.regenerate,
        previousImageUrl: opts.previousImageUrl || null,
      });
      try {
        const imagePrompt = opts.editImage
          ? `Edit the attached image according to this request: ${text}\n\nKeep the same character, pose, composition and art style unless the request says to change them. Return the edited image.`
          : imageShortcut
          ? (uploadedUrls.length && !text.trim().replace(imageShortcut[0], "").trim()
              ? `Transform the uploaded image into ${imageShortcut[1]} style. Preserve the main subject, identity, composition, and important visual details while applying a polished ${imageShortcut[1]} aesthetic.`
              : expandImagePrompt(text))
          : magic ? magic.imagePrompt : (command?.cmd.command === "/image" ? command.arg : text);
        const res = await api.functions.invoke("generateImage", {
          prompt: imagePrompt,
          image_urls: uploadedUrls,
          source_image_urls: uploadedUrls,
          mode: uploadedUrls.length && (imageShortcut || opts.editImage) ? "image_to_image" : "text_to_image",
          shortcut: imageShortcut?.[0] || null,
          style: imageShortcut?.[1] || null,
        });
        const imageUrl = res.data?.url;
        if (imageUrl) {
          if (!isAdmin && !isPremium) recordImageQuotaUse();
          const savedImg = await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: "", file_urls: [imageUrl] });
          void touchConversation(convoId);
          setMessages(thread = [...history, { role: "assistant", content: "", file_urls: [imageUrl], id: savedImg?.id ?? savedImg?.item?.id }]);
        } else {
          await failImage();
        }
      } catch (e) {
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
      try {
        const res = await api.functions.invoke("xryonChat", {
          messages: history.filter((m) => !m.preview && !m.comparison).map((m) => ({ role: m.role, content: m.role === "user" ? stripCommand(m.content) : m.content })),
          persona: getSetting("persona", "concise"),
          system_prompt: [
            XYRON_PERSONA_PROMPT,
            XYRON_IDENTITY_PROMPT,
            XYRON_RESPONSE_STYLE_PROMPT,
            XYRON_AGENT_PROMPT,
            XYRON_MULTI_FILE_PROMPT,
            XYRON_FILE_NOTES_PROMPT,
            getSetting("systemPrompt", ""),
            XMODE_PROMPTS[getSetting("xyronMode", "auto")],
            command?.cmd.kind === "mode" ? command.cmd.prompt : "",
            magic ? magic.prompt : "",
            zipSource ? XYRON_ZIP_PROMPT : XYRON_NO_ZIP_PROMPT,
            zipSource || command ? "" : XYRON_IMAGE_PROMPT,
          ].filter(Boolean).join("\n\n"),
          // New attachments win; otherwise keep using the most recent image in the
          // conversation so follow-up questions about it still work.
          file_urls: [...new Set([
            ...(uploadedUrls.length ? uploadedUrls : (history.slice().reverse().find((m) => m.role === "user" && m.file_urls?.length)?.file_urls || [])),
            ...(zipSource ? [zipSource] : []),
          ])],
        });
        const rawReply = res.data?.reply;
        if (!rawReply) throw new Error("Empty reply from the server");
        if (previewDone) await previewDone;
        // Visual answers: strip the hidden [[images: ...]] line and decide whether to add a gallery.
        // Never for ZIP work, commands, or when a preview/comparison card already covers the topic
        // (unless the person explicitly asked for pictures).
        const tagged = extractImageTag(rawReply);
        const reply = tagged.text || rawReply.replace(/\[\[\s*images?\s*:[^\]]*\]\]/gi, "").trim();
        const explicitQuery = visualQueryFromText(text);
        const imageQuery = zipSource || command || !reply ? null : (explicitQuery || (!entityQuery && !comparisonQuery ? tagged.query : null));
        const msgKey = `ai_${Date.now()}`;
        const created = await api.entities.Message.create({ conversation_id: convoId, role: "assistant", content: reply, ...(zipSource ? { zip_source: zipSource } : {}) });
        const msgId = created?.id ?? created?.item?.id;
        void touchConversation(convoId);
        setMessages((cur) => [...cur, { role: "assistant", content: reply, key: msgKey, id: msgId, ...(zipSource ? { zip_source: zipSource } : {}), ...(imageQuery ? { images: { status: "loading", query: imageQuery, items: [] } } : {}) }]);
        if (imageQuery) void loadGallery(msgKey, msgId, imageQuery);
        opts.onReply?.(reply);
      } catch (e) {
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

  const remaining = isAdmin || isPremium ? null : (
    `${Math.max(0, FREE_MESSAGE_QUOTA - getMessageQuota().count)} questions · ${Math.max(0, FREE_IMAGE_QUOTA - getImageQuota().count)} images (resets every 4h) · ${Math.max(0, FREE_FILE_LIMIT - getDailyFileCount())} files · ${Math.max(0, FREE_DOCUMENTATION_LIMIT - getDailyDocumentationCount())} docs left today.`
  );

  const isEmptyChat = messages.length === 0 && !thinking && !imageLoading && !uploadStatus;

  // PC: the box sits in the middle of an empty chat; once chatting it glides down to the bottom.
  const wasEmpty = useRef(isEmptyChat);
  const [settling, setSettling] = useState(false);
  // On a fresh/empty chat the greeting + box start in the middle; after 4 seconds they glide
  // down to the normal bottom spot (unless the person is already typing in the box).
  const [docked, setDocked] = useState(false);
  const dockedRef = useRef(false);
  dockedRef.current = docked;
  const dockHold = useRef(false);
  useEffect(() => {
    if (!isEmptyChat) { setDocked(false); return; }
    dockHold.current = false;
    let t2;
    const t = setTimeout(() => {
      if (dockHold.current) return;
      setSettling(true);
      setDocked(true);
      t2 = setTimeout(() => setSettling(false), 500);
    }, 4000);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [isEmptyChat]);
  useEffect(() => {
    if (wasEmpty.current && !isEmptyChat && !dockedRef.current) {
      setSettling(true);
      const t = setTimeout(() => setSettling(false), 500);
      wasEmpty.current = false;
      return () => clearTimeout(t);
    }
    wasEmpty.current = isEmptyChat;
  }, [isEmptyChat]);

  const openPremium = () => {
    if (isPremium) { navigate("/premium"); return; }
    setLimitTypes([]); setUpgradeReason("upload"); setUpgradeOpen(true);
  };

  return (
    <div className="xyron-chat-shell relative min-h-screen bg-black text-neutral-100 selection:bg-white selection:text-black xyron-safe-x">
      <div className="xyron-ambient-graphics" aria-hidden="true"><span className="xyron-graphic graphic-a" /><span className="xyron-graphic graphic-b" /><span className="xyron-graphic graphic-c" /></div>
      <Sidebar conversations={conversations} activeId={activeId} onSelect={openConversation} onNew={newChat} onDelete={deleteConversation} onRename={renameConversation} open={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopOpen={desktopSidebarOpen} onToggleDesktop={() => setDesktopSidebarOpen((current) => !current)} onHelp={() => setHelpOpen(true)} />

      <div className={`relative flex min-h-screen flex-col transition-[padding] duration-200 ${desktopSidebarOpen ? "md:pl-72" : "md:pl-0"}`}>
        <header className="xyron-safe-top sticky top-0 z-40 flex items-center gap-2 border-b border-white/15 bg-black px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3 md:hidden">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open menu" className={headerIconBtn}><Menu className="h-5 w-5" strokeWidth={2.4} /></button>
          <span className="font-display tracking-tight">Xyron</span>
          <div className="ml-auto flex items-center gap-2">
            {!isAdmin && <button type="button" onClick={openPremium} className={headerIconBtn} title="Premium" aria-label="Premium"><Sparkles className="h-5 w-5" strokeWidth={2.4} /></button>}
            <button type="button" onClick={() => setHelpOpen(true)} className={headerIconBtn} title="Help & Support" aria-label="Help & Support"><LifeBuoy className="h-5 w-5" strokeWidth={2.4} /></button>
            <button type="button" onClick={() => setCtxMenuOpen((open) => !open)} className={headerIconBtn} title="More" aria-label="More options" aria-haspopup="menu" aria-expanded={ctxMenuOpen}><MoreVertical className="h-5 w-5" strokeWidth={2.4} /></button>
          </div>
        </header>

        {!isEmptyChat && <header className="sticky top-0 z-40 hidden items-center justify-between gap-2 border-b border-white/15 bg-black px-4 py-3 md:flex">
          <button type="button" onClick={() => setDesktopSidebarOpen((current) => !current)} aria-label={desktopSidebarOpen ? "Close history sidebar" : "Open history sidebar"} title={desktopSidebarOpen ? "Close history sidebar" : "Open history sidebar"} className={headerIconBtn}>{desktopSidebarOpen ? <PanelLeftClose className="h-5 w-5" strokeWidth={2.4} /> : <PanelLeftOpen className="h-5 w-5" strokeWidth={2.4} />}</button>
          <div className="ml-auto flex items-center gap-2">
          {isAdmin ? <span className="rounded-full border border-white/25 bg-[#232326] px-4 py-2 text-xs font-medium text-white">Admin • unlimited access</span> : <button type="button" onClick={openPremium} className={headerPillBtn}><Sparkles className="h-4 w-4" strokeWidth={2.4} /> Premium</button>}
          <button type="button" onClick={() => setHelpOpen(true)} className={headerPillBtn}><LifeBuoy className="h-4 w-4" strokeWidth={2.4} /> Help</button>
          <button type="button" onClick={() => setCtxMenuOpen((open) => !open)} className={headerIconBtn} title="More" aria-label="More options" aria-haspopup="menu" aria-expanded={ctxMenuOpen}><MoreVertical className="h-5 w-5" strokeWidth={2.4} /></button>
          </div>
        </header>}

        {isEmptyChat && <button type="button" onClick={() => setDesktopSidebarOpen((current) => !current)} aria-label={desktopSidebarOpen ? "Close sidebar" : "Open sidebar"} aria-pressed={desktopSidebarOpen} title={`${desktopSidebarOpen ? "Close" : "Open"} sidebar (Ctrl+B)`} className={`fixed top-3 z-30 hidden h-9 w-9 place-items-center rounded-xl border border-white/15 bg-[#151518] text-neutral-300 shadow-lg transition-[left,background-color] duration-200 hover:bg-[#222225] hover:text-white md:grid ${desktopSidebarOpen ? "left-[19rem]" : "left-3"}`}><PanelLeft className="h-4 w-4" /></button>}

        <main className={`xyron-chat-main flex-1 ${isEmptyChat ? "md:min-h-screen" : ""}`}>
          {isEmptyChat ? <div className="h-[calc(100vh-9rem)] md:h-[calc(100vh-4rem)]" aria-hidden="true" /> : <div className="xyron-message-list mx-auto w-full max-w-3xl space-y-5 px-3 py-6 sm:px-5 sm:py-10">{messages.map((m, i) => <MessageBubble key={m.key || m.id || i} role={m.role} content={m.content} file_urls={m.file_urls} preview={m.preview} comparison={m.comparison} images={m.images} zipSource={m.zip_source} onRetryImages={() => loadGallery(m.key || m.id, m.id, m.images?.query)} canEdit={m.role === "user" && !thinking && !imageLoading && !uploadStatus} onEditSend={(t) => editAndResend(i, t)} local={m.local} isLast={i === messages.length - 1} onRegenerate={regenerate} regenerateDisabled={thinking || imageLoading} />)}{uploadStatus && <div role="status" aria-live="polite" className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs text-neutral-300"><span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />{uploadStatus.phase === "uploading" ? `Uploading files ${uploadStatus.done}/${uploadStatus.total}${uploadStatus.currentName ? ` · ${uploadStatus.currentName}` : ""}…` : uploadStatus.phase === "analyzing" ? "Files uploaded · preparing AI analysis…" : "Files ready · Xyron is analyzing and preparing a reply…"}</div>}<RedOrb active={thinking} size={56} /><ImageForge active={imageLoading} prompt={forge.prompt} regenerating={forge.regenerating} previousImageUrl={forge.previousImageUrl} /><div ref={endRef} /></div>}
        </main>

        <div className={`xyron-safe-bottom xyron-composer-dock sticky bottom-0 bg-black pt-4 ${isEmptyChat && !docked ? `xyron-empty-composer pointer-events-none fixed inset-0 flex items-center justify-center bg-transparent pt-0 transition-[padding] duration-200 ${desktopSidebarOpen ? "md:pl-72" : ""}` : ""} ${settling ? "xyron-dock-settle" : ""}`}>
          <div className={`mx-auto w-full max-w-3xl px-3 sm:px-5 ${isEmptyChat && !docked ? "pointer-events-auto" : ""}`} onFocusCapture={() => { dockHold.current = true; }}>
            {isEmptyChat && (
              <div className="mb-5 flex items-center justify-center gap-2.5 text-center md:mb-6 md:gap-3">
                <Sparkles className="h-6 w-6 text-white md:h-8 md:w-8" strokeWidth={1.75} />
                <h1 className="font-display text-2xl tracking-tight text-white md:text-3xl">{greeting}<span className="hidden md:inline">{firstName ? `, ${firstName}` : ""}</span></h1>
              </div>
            )}
            <Composer onSend={send} disabled={thinking || imageLoading || !!uploadStatus} onClearChat={newChat} onRegenerate={regenerate} onExport={exportChat} onShare={shareChat} onOpenHistory={() => setSidebarOpen(true)} onAction={runAction} onVoiceChat={() => setVoiceOpen(true)} />
            {remaining && <p className="mt-3 text-center text-[11px] text-neutral-600">{remaining} <a href="/premium" className="underline hover:text-neutral-300">Upgrade for more</a></p>}
            {(isPremium || isAdmin) && <p className="mt-3 text-center text-[11px] text-neutral-600">{isAdmin ? "Admin access • unlimited service usage." : "Xyron can make mistakes. Verify important information."}</p>}
          </div>
        </div>
      </div>

      <ContextMenu open={ctxMenuOpen} onClose={() => setCtxMenuOpen(false)} onClearChat={newChat} onShare={shareChat} onExport={exportChat} onHelp={() => setHelpOpen(true)} onFeedback={() => setFeedbackKind("feedback")} onReportBug={() => setFeedbackKind("bug")} hasMessages={messages.length > 0} />
      <AuthRequiredModal open={authRequiredOpen} onClose={() => setAuthRequiredOpen(false)} />
      <LimitUpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reached={limitTypes} uploaded={upgradeReason === "upload"} />
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
      <FeedbackModal open={feedbackKind !== null} kind={feedbackKind || "feedback"} onClose={() => setFeedbackKind(null)} />
      <QuotaModal open={quotaModalOpen} onClose={() => setQuotaModalOpen(false)} kind={quotaKind} />
      <ErrorPopup open={errorOpen} onClose={() => setErrorOpen(false)} onContinue={retryLast} canUpgrade={!isAdmin && !isPremium} />
      <ChatPausedModal open={pausedOpen} onClose={() => setPausedOpen(false)} resetAt={pausedResetAt} onNewChat={() => { setPausedOpen(false); newChat(); }} />
      <VoiceChat open={voiceOpen} onClose={() => setVoiceOpen(false)} onSend={(text, voiceOpts = {}) => send(text, [], voiceOpts)} />
    </div>
  );
}




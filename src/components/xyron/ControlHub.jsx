import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Sparkles, Wand2, User, Settings as SettingsIcon, LifeBuoy, LogOut } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { TIERS } from "../../lib/settings";
import DockAvatar from "./DockAvatar";

const TIER_LABELS = {
  free: TIERS.free.label,
  premium: TIERS.premium.label,
  premium_plus: TIERS.premium_plus.label,
  admin: "Admin",
};

export function planLabelFor(tier) {
  if (tier === null || tier === undefined) return "Loading plan…";
  if (tier === "error") return "Plan unavailable";
  return TIER_LABELS[tier] || "Plan unavailable";
}

function Row({ to, icon: Icon, chevron = false, onClick, children }) {
  const content = (
    <>
      <span className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
        <span className="truncate">{children}</span>
      </span>
      {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" />}
    </>
  );
  const className = "flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-neutral-200 transition duration-150 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40";
  if (to) return <Link to={to} onClick={onClick} className={className}>{content}</Link>;
  return <button type="button" onClick={onClick} className={className}>{content}</button>;
}

export default function ControlHub({
  open,
  onClose,
  tier,
  displayName,
  avatarUrl,
  initials,
  avatarColorClass,
  onHelp,
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const panelRef = useRef(null);
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);

  // Mount immediately on open; keep mounted briefly on close so the
  // closing transition (fade + ~6-10px translate) can actually play.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onDocClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const planLabel = planLabelFor(tier);
  const isAdmin = tier === "admin";
  const planActionLabel = tier === "premium" || tier === "premium_plus" ? "Manage plan" : "Upgrade plan";

  const handleHelp = () => {
    onClose();
    if (onHelp) onHelp();
    else navigate("/");
  };

  const handleLogout = async () => {
    onClose();
    try { await logout(); } catch { /* local state is cleared regardless */ }
    navigate("/");
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Xyron Control Hub"
      className={`absolute inset-x-3 bottom-full z-50 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-[#161618] p-2 shadow-2xl shadow-black/60 outline-none transition duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none ${
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <Link to="/settings" onClick={onClose} className="flex items-center gap-3 rounded-xl px-2 py-2 transition duration-150 hover:bg-white/5">
        <DockAvatar url={avatarUrl} initials={initials} colorClass={avatarColorClass} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{displayName}</p>
          <p className="truncate text-xs text-neutral-500">{planLabel}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" />
      </Link>

      <div className="my-1.5 h-px bg-white/10" />

      {!isAdmin && <Row to="/premium" icon={Sparkles} onClick={onClose}>{planActionLabel}</Row>}
      <Row to="/settings?tab=personalization" icon={Wand2} onClick={onClose}>Personalization</Row>
      <Row to="/settings" icon={User} onClick={onClose}>Profile</Row>
      <Row to="/settings?tab=account" icon={SettingsIcon} onClick={onClose}>Settings</Row>

      <div className="my-1.5 h-px bg-white/10" />

      <Row icon={LifeBuoy} chevron onClick={handleHelp}>Help</Row>
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm text-red-300/90 transition duration-150 hover:bg-red-500/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/40"
      >
        <LogOut className="h-4 w-4 shrink-0" /> Log out
      </button>
    </div>
  );
}

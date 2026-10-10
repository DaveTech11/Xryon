import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronUp, User as UserIcon, LogIn } from "lucide-react";
import { useAuth } from "../../lib/AuthContext";
import { getTier } from "../../lib/settings";
import DockAvatar, { initialsFor, avatarColorFor } from "./DockAvatar";
import ControlHub, { planLabelFor } from "./ControlHub";

export default function ProfileDock({ onHelp }) {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const [open, setOpen] = useState(false);
  // null = still resolving, "error" = the lookup itself failed unexpectedly,
  // otherwise one of the app's real tier ids ("free" | "premium" | "premium_plus" | "admin").
  const [tier, setTier] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setTier(null);
    getTier()
      .then((t) => { if (!cancelled) setTier(t); })
      .catch(() => { if (!cancelled) setTier("error"); });
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id]);

  const close = () => setOpen(false);

  if (isLoadingAuth) {
    return (
      <div className="px-3 pt-2 xyron-safe-bottom">
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.02] px-2.5 py-2">
          <div className="h-[34px] w-[34px] shrink-0 animate-pulse rounded-xl bg-white/10" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-2.5 w-20 animate-pulse rounded bg-white/10" />
            <div className="h-2 w-14 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="px-3 pt-2 xyron-safe-bottom">
        <Link
          to="/login"
          className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition duration-150 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
            <UserIcon className="h-4 w-4 text-neutral-400" />
          </div>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">Guest</span>
            <span className="block truncate text-xs text-neutral-500">Sign in</span>
          </span>
          <LogIn className="h-4 w-4 shrink-0 text-neutral-600" />
        </Link>
      </div>
    );
  }

  const rawName = (user?.full_name || "").trim();
  const email = user?.email || "";
  const displayName = rawName || email || "User";
  const avatarUrl = user?.profile_pic_url || null;
  const initials = initialsFor(rawName, email);
  const avatarColorClass = avatarColorFor(user?.id || email);
  const planLabel = planLabelFor(tier);
  // Free (and still-resolving/unknown) accounts see the same "Upgrade" pill
  // as the reference; known paid/admin accounts get a plain chevron instead.
  const showUpgradePill = tier !== "premium" && tier !== "premium_plus" && tier !== "admin";

  return (
    <div className="relative px-3 pt-2 xyron-safe-bottom">
      <ControlHub
        open={open}
        onClose={close}
        tier={tier}
        displayName={displayName}
        avatarUrl={avatarUrl}
        initials={initials}
        avatarColorClass={avatarColorClass}
        onHelp={onHelp}
      />
      <div
        className={`flex w-full items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-all duration-150 hover:bg-white/[0.07] ${
          open ? "-translate-y-0.5 border-white/20 bg-white/[0.08]" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Xyron Control Hub — ${displayName}, ${planLabel}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <DockAvatar url={avatarUrl} initials={initials} colorClass={avatarColorClass} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">{displayName}</span>
            <span className="block truncate text-xs text-neutral-500">{planLabel}</span>
          </span>
        </button>
        {showUpgradePill ? (
          <Link
            to="/premium"
            className="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            Upgrade
          </Link>
        ) : (
          <ChevronUp className={`h-4 w-4 shrink-0 text-neutral-600 transition-transform duration-150 ${open ? "rotate-180 text-neutral-300" : ""}`} />
        )}
      </div>
    </div>
  );
}

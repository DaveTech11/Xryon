import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Pencil, Check, X, Loader2, AlertTriangle, Mail, Crown, CalendarDays, AtSign, User as UserIcon } from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../lib/AuthContext";
import { getTier, TIERS } from "../../lib/settings";
import DockAvatar, { initialsFor, avatarColorFor } from "./DockAvatar";

function usernameFor(user) {
  if (user?.username) return user.username;
  return String(user?.email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "");
}

function formatMemberSince(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString([], { month: "long", year: "numeric" });
}

// One line of the profile card. If `onSave` is given the row can be edited in place.
function Row({ icon: Icon, label, value, prefix = "", onSave, maxLength, hint }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const cancel = () => { setEditing(false); setError(""); setDraft(value); };
  const commit = async () => {
    const next = draft.trim();
    if (next === value) return cancel();
    setSaving(true); setError("");
    try { await onSave(next); setEditing(false); }
    catch (e) { setError(e.message || "Couldn't save that."); }
    setSaving(false);
  };

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-500">{label}</p>
          {editing ? (
            <div className="mt-1.5 flex items-center gap-2">
              {prefix && <span className="text-sm text-neutral-500">{prefix}</span>}
              <input
                ref={inputRef}
                value={draft}
                maxLength={maxLength}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm text-white outline-none focus:border-white/35"
              />
              <button type="button" onClick={commit} disabled={saving} aria-label="Save" className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-black hover:bg-neutral-200 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </button>
              <button type="button" onClick={cancel} disabled={saving} aria-label="Cancel" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-neutral-300 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="mt-0.5 truncate text-sm text-neutral-100">{prefix}{value || "—"}</p>
          )}
          {editing && (error ? <p className="mt-1.5 text-xs text-red-400">{error}</p> : hint && <p className="mt-1.5 text-xs text-neutral-600">{hint}</p>)}
        </div>
        {onSave && !editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit ${label}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 transition hover:bg-white/10 hover:text-white">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AccountPanel({ user, onUserChange, onDeleteAccount, deleting, deleted, deleteError }) {
  const { checkUserAuth } = useAuth();
  const [tier, setTier] = useState(null);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [picError, setPicError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (user) getTier().then(setTier).catch(() => setTier("free")); }, [user?.id]);

  if (!user) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm text-neutral-400">Sign in to manage your account.</p>
        <Link to="/login" className="mt-3 inline-block text-sm text-violet-300 hover:text-violet-200">Sign in →</Link>
      </div>
    );
  }

  const save = async (patch) => {
    const updated = await api.auth.updateMe(patch);
    onUserChange?.(updated);
    checkUserAuth?.();
    return updated;
  };

  const uploadPic = async (file) => {
    setUploadingPic(true); setPicError("");
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      await save({ profile_pic_url: file_url });
    } catch (e) { setPicError(e.message || "Couldn't upload that photo."); }
    setUploadingPic(false);
  };

  const name = (user.full_name || "").trim();
  const initials = initialsFor(name, user.email);
  const planLabel = tier === "admin" ? "Admin" : tier ? (TIERS[tier]?.label || "Free") : "…";

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="flex flex-col items-center rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] px-5 py-7 text-center">
        <div className="relative">
          <DockAvatar url={user.profile_pic_url || null} initials={initials} colorClass={avatarColorFor(user.id || user.email)} size={84} />
          <label className="absolute -bottom-1 -right-1 grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-white/20 bg-[#111] text-neutral-200 transition hover:bg-white hover:text-black" title="Change photo">
            {uploadingPic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingPic}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPic(f); e.target.value = ""; }}
            />
          </label>
        </div>
        <p className="mt-4 text-lg font-semibold text-white">{name || user.email}</p>
        <p className="text-sm text-neutral-500">@{usernameFor(user)}</p>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-neutral-300">
          <Crown className="h-3 w-3" /> {planLabel}
        </span>
        {picError && <p className="mt-3 text-xs text-red-400">{picError}</p>}
      </div>

      {/* Details */}
      <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <Row icon={UserIcon} label="Name" value={name} maxLength={40} hint="2–40 characters." onSave={(v) => save({ full_name: v })} />
        <Row icon={AtSign} label="Username" value={usernameFor(user)} prefix="@" maxLength={24} hint="3–24 letters, numbers, dots or underscores." onSave={(v) => save({ username: v })} />
        <Row icon={Mail} label="Email" value={user.email || ""} />
        <Row icon={CalendarDays} label="Member since" value={formatMemberSince(user.created_date)} />
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl border border-red-500/20 bg-red-500/[0.03] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-red-300"><AlertTriangle className="h-4 w-4" /> Delete account</p>
            <p className="mt-0.5 text-xs text-neutral-500">Permanently removes your account and all its data, then takes you back to sign in.</p>
          </div>
          {!confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="shrink-0 rounded-full border border-red-500/50 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10">
              Delete
            </button>
          )}
        </div>
        {confirmDelete && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-black/30 p-4">
            <p className="text-sm text-neutral-200">This can't be undone. Your conversations, files and settings will be gone.</p>
            {(tier === "premium" || tier === "premium_plus") && <p className="mt-1 text-xs text-amber-300">Your active {planLabel} plan will be lost too.</p>}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onDeleteAccount} disabled={deleting} className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className="rounded-full border border-white/15 px-4 py-2 text-sm text-neutral-300 hover:bg-white/10">
                Keep my account
              </button>
            </div>
          </div>
        )}
        {deleteError && <p className="mt-3 text-sm text-red-400">{deleteError}</p>}
        {deleted && <p className="mt-3 text-sm text-green-400">Account deleted. Taking you to sign in…</p>}
      </div>
    </div>
  );
}

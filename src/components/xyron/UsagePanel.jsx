import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Image as ImageIcon, FileText, BookOpen, Sparkles, Infinity as InfinityIcon } from "lucide-react";
import { api } from "../../api/client";
import {
  TIERS,
  FREE_FILE_LIMIT,
  FREE_DOCUMENTATION_LIMIT,
  FREE_MESSAGE_QUOTA,
  FREE_IMAGE_QUOTA,
  getTier,
  getMessageQuota,
  getImageQuota,
  getQuotaResetMs,
  getDailyFileCount,
  getDailyDocumentationCount,
  formatQuotaReset,
} from "../../lib/settings";

// Server-side daily counters (UTC day) are used for paid plans, which don't
// track locally. The server kinds are: ai, image, file, documentation.
function serverCount(rows, kind) {
  const today = new Date().toISOString().slice(0, 10);
  const row = rows.find((r) => r.kind === kind && String(r.key || "").endsWith(`:${today}`));
  return Number(row?.count) || 0;
}

function msUntilUtcMidnight() {
  const n = new Date();
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - n.getTime();
}

function barColor(pctLeft) {
  if (pctLeft <= 15) return "bg-red-400";
  if (pctLeft <= 40) return "bg-amber-400";
  return "bg-white";
}

function Meter({ icon: Icon, title, hint, used, limit, resetText }) {
  const unlimited = !Number.isFinite(limit);
  const left = unlimited ? null : Math.max(0, limit - used);
  const pctLeft = unlimited ? 100 : Math.max(0, Math.min(100, Math.round((left / limit) * 100)));

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
          <Icon className="h-4 w-4 text-neutral-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-neutral-500">{hint}</p>
        </div>
        <div className="text-right">
          {unlimited ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-300"><InfinityIcon className="h-4 w-4" /> Unlimited</span>
          ) : (
            <>
              <p className="text-sm font-semibold tabular-nums text-white">{left} <span className="font-normal text-neutral-500">left</span></p>
              <p className="text-[11px] tabular-nums text-neutral-600">{used} of {limit} used</p>
            </>
          )}
        </div>
      </div>

      {!unlimited && (
        <div className="mt-4">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pctLeft}
            aria-label={`${title}: ${pctLeft}% left`}
          >
            <div className={`h-full rounded-full transition-all duration-500 ${barColor(pctLeft)}`} style={{ width: `${pctLeft}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>{pctLeft}% left</span>
            <span>{resetText}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsagePanel() {
  const [tier, setTier] = useState(null);
  const [rows, setRows] = useState([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getTier();
      if (cancelled) return;
      setTier(t);
      try {
        const mine = await api.usage.mine();
        if (!cancelled) setRows(mine);
      } catch { /* offline / guest — fall back to on-device counters */ }
    })();
    // Re-render every 30s so the "resets in" text and bars stay current.
    const iv = setInterval(() => setTick((n) => n + 1), 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  if (!tier) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/[0.04]" />)}
      </div>
    );
  }

  const isFree = tier === "free";
  const isAdmin = tier === "admin";
  const plan = isAdmin ? { label: "Admin" } : TIERS[tier] || TIERS.free;
  const dayReset = `Resets in ${formatQuotaReset(msUntilUtcMidnight())}`;

  let meters;
  if (isFree) {
    const msg = getMessageQuota();
    const img = getImageQuota();
    meters = [
      {
        icon: MessageSquare, title: "Questions", hint: "Shared 4-hour window",
        used: msg.count, limit: FREE_MESSAGE_QUOTA,
        resetText: msg.count === 0 ? "Window starts at your next question" : `Resets in ${formatQuotaReset(getQuotaResetMs("message"))}`,
      },
      {
        icon: ImageIcon, title: "Image generation", hint: "Shared 4-hour window",
        used: img.count, limit: FREE_IMAGE_QUOTA,
        resetText: img.count === 0 ? "Window starts at your next image" : `Resets in ${formatQuotaReset(getQuotaResetMs("image"))}`,
      },
      { icon: FileText, title: "File uploads", hint: "Daily", used: getDailyFileCount(), limit: FREE_FILE_LIMIT, resetText: dayReset },
      { icon: BookOpen, title: "Documentation", hint: "Daily", used: getDailyDocumentationCount(), limit: FREE_DOCUMENTATION_LIMIT, resetText: dayReset },
    ];
  } else {
    const limits = isAdmin
      ? { dailyLimit: Infinity, imgLimit: Infinity, fileLimit: Infinity, docLimit: Infinity }
      : plan;
    meters = [
      { icon: MessageSquare, title: "Questions", hint: "Daily", used: serverCount(rows, "ai"), limit: limits.dailyLimit, resetText: dayReset },
      { icon: ImageIcon, title: "Image generation", hint: "Daily", used: serverCount(rows, "image"), limit: limits.imgLimit, resetText: dayReset },
      { icon: FileText, title: "File uploads", hint: "Daily", used: serverCount(rows, "file"), limit: limits.fileLimit, resetText: dayReset },
      { icon: BookOpen, title: "Documentation", hint: "Daily", used: serverCount(rows, "documentation"), limit: limits.docLimit, resetText: dayReset },
    ];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Current plan</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{plan.label}</p>
        </div>
        {isFree && (
          <Link to="/premium" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-neutral-200">
            <Sparkles className="h-3.5 w-3.5" /> Upgrade
          </Link>
        )}
      </div>

      {meters.map((m) => <Meter key={m.title} {...m} />)}

      <p className="px-1 text-[11px] leading-relaxed text-neutral-600">
        {isFree
          ? "Questions and images use a rolling 4-hour window that starts with your first use. Files and documentation reset daily at 00:00 UTC."
          : "All limits reset daily at 00:00 UTC."}
      </p>
    </div>
  );
}

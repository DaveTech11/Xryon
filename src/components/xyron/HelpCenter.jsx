import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, ChevronLeft, ChevronRight, Search, Copy, Check, ExternalLink,
  LifeBuoy, HelpCircle, UserCog, Settings2, ShieldCheck, CreditCard, Flag, Mail, Sparkles, Keyboard, Wrench, Send,
} from "lucide-react";
import { HELP_SECTIONS } from "../../lib/helpContent";

const ICONS = { LifeBuoy, HelpCircle, UserCog, Settings2, ShieldCheck, CreditCard, Flag, Mail, Sparkles, Keyboard, Wrench, Send };

// Minimal **bold** parsing — content stays plain data, no JSX in helpContent.js.
function Rich({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="text-neutral-100">{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

function ReportForm({ onClose }) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-400">Describe what happened — what you expected, and what Xyron did instead. Copy it and send it wherever your team tracks reports (or paste it into Contact support).</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="e.g. Asked /compare iPhone vs Pixel and the comparison card never loaded…"
        className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-white/20"
      />
      <div className="flex gap-2">
        <button type="button" onClick={copy} disabled={!text.trim()} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/5 hover:text-white disabled:opacity-30">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy report"}
        </button>
        <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-neutral-400 hover:bg-white/5 hover:text-white">Done</button>
      </div>
    </div>
  );
}

function Contact({ email }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-400">Email the team directly and we'll get back to you.</p>
      <div className="flex flex-wrap items-center gap-2">
        <a href={`mailto:${email}`} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-medium text-black hover:bg-neutral-200">
          <Mail className="h-3.5 w-3.5" /> Email {email}
        </a>
        <button type="button" onClick={copy} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-white/5 hover:text-white">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy address"}
        </button>
      </div>
    </div>
  );
}

function LinkList({ intro, links }) {
  return (
    <div className="space-y-3">
      {intro && <p className="text-sm text-neutral-400">{intro}</p>}
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.url}>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 transition hover:bg-white/5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-neutral-300">
                <Send className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-100">{l.label}</span>
                {l.desc && <span className="block truncate text-[11px] text-neutral-500">{l.desc}</span>}
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ section, onClose }) {
  const Icon = ICONS[section.icon] || HelpCircle;
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-neutral-300"><Icon className="h-4 w-4" /></span>
        <h4 className="text-base font-semibold text-white">{section.title}</h4>
      </div>
      {section.type === "article" && (
        <div className="space-y-3 text-sm leading-relaxed text-neutral-300">
          {section.body.map((p, i) => <p key={i}><Rich text={p} /></p>)}
        </div>
      )}
      {section.type === "shortcuts" && (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10">
          {section.shortcuts.map(([keys, desc]) => (
            <li key={keys} className="flex items-center justify-between gap-3 bg-white/[0.02] px-3 py-2.5 text-sm">
              <span className="text-neutral-300">{desc}</span>
              <span className="flex shrink-0 gap-1">
                {keys.split(" + ").map((k) => <kbd key={k} className="rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 text-[11px] text-neutral-300">{k}</kbd>)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {section.type === "report" && <ReportForm onClose={onClose} />}
      {section.type === "contact" && <Contact email={section.email} />}
      {section.type === "links" && <LinkList intro={section.intro} links={section.links} />}
    </div>
  );
}

export default function HelpCenter({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_SECTIONS;
    return HELP_SECTIONS.filter((s) => s.title.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;
  const active = HELP_SECTIONS.find((s) => s.id === activeId);

  const openSection = (section) => {
    if (section.type === "link") { onClose?.(); navigate(section.target); return; }
    setActiveId(section.id);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0a0b] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          {active ? (
            <button type="button" onClick={() => setActiveId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Back">
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400"><LifeBuoy className="h-4 w-4" /></span>
          )}
          <h3 className="flex-1 text-sm font-semibold text-white">{active ? active.title : "Help & Support"}</h3>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-white" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {active ? (
            <Detail section={active} onClose={onClose} />
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-600" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search help"
                  className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-white/20"
                />
              </div>
              <ul className="space-y-1">
                {results.map((s) => {
                  const Icon = ICONS[s.icon] || HelpCircle;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => openSection(s)}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/5"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-neutral-300"><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-neutral-100">{s.title}</span>
                          <span className="block truncate text-[11px] text-neutral-500">{s.summary}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-600" />
                      </button>
                    </li>
                  );
                })}
                {results.length === 0 && <p className="px-2.5 py-6 text-center text-sm text-neutral-600">No results for "{query}".</p>}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}



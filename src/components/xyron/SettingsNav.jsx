import React from "react";
import {
  User, Sparkles, Bell, Mic, CreditCard, BarChart3,
  Database, ShieldCheck, Lock, UserCheck, UserCog, Brain,
} from "lucide-react";

export const SETTINGS_NAV = [
  { key: "general", label: "General", icon: User },
  { key: "personalization", label: "Personalization", icon: Sparkles },
  { key: "memory", label: "Memory", icon: Brain },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "voice", label: "Voice", icon: Mic },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "usage", label: "Usage", icon: BarChart3 },
  { key: "data", label: "Data Controls", icon: Database },
  { key: "security", label: "Security", icon: Lock },
  { key: "trusted", label: "Trusted Contact", icon: UserCheck },
  { key: "account", label: "Account", icon: UserCog },
];

export default function SettingsNav({ activeNav, onSelect, search = "" }) {
  return (
    <nav className="space-y-1">
      {SETTINGS_NAV.filter((x) => x.label.toLowerCase().includes(search.toLowerCase())).map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm ${
            activeNav === key ? "bg-white/10 text-white" : "text-neutral-500 hover:bg-white/5 hover:text-white"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </nav>
  );
}


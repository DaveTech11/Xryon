import React, { useEffect } from "react";
import { Ban } from "lucide-react";

// Shown to a banned person: right after an admin bans them, and every time they try to sign in again.
export default function Deactivated() {
  useEffect(() => {
    try { localStorage.removeItem("xryon_current_user"); } catch { /* ignore */ }
    document.title = "Account deactivated · Xryon";
  }, []);
  return (
    <main className="grid min-h-screen place-items-center bg-black px-5 text-center text-white">
      <div className="w-full max-w-md">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/5"><Ban className="h-6 w-6 text-neutral-300" /></div>
        <h1 className="text-2xl font-semibold tracking-tight">Your account has been deactivated</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">This account is no longer active, so you can't access Xryon with it.</p>
        <p className="mt-1 text-sm text-neutral-500">Thanks for using Xryon.</p>
      </div>
    </main>
  );
}

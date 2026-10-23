import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";

// Mobile  (< lg): Aurora-style screen: brand on top, big centred title, form, footer pinned to the bottom.
// Desktop (>= lg): framed glass card with a top nav, chrome-helmet art on the left and the form on the right.
function Brand() {
  return (
    <div className="flex items-center justify-center lg:hidden">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 min-[420px]:h-11 min-[420px]:w-11 ring-1 ring-white/10">
        <svg width="22" height="22" viewBox="0 0 100 100" aria-hidden="true">
          <path d="M12 12 L45 50 L12 88 L28 88 L53 58 L78 88 L94 88 L61 50 L94 12 L78 12 L53 42 L28 12 Z" fill="#ffffff" />
        </svg>
      </span>
      <span className="ml-3 text-[22px] font-medium tracking-tight text-white min-[420px]:text-[26px]">Xyron</span>
    </div>
  );
}

function DesktopNav() {
  const { pathname } = useLocation();
  const signIn = pathname.startsWith("/login");
  const register = pathname.startsWith("/register");
  const link = "text-[13px] text-neutral-200 transition hover:text-white";
  return (
    <nav className="hidden items-center justify-between px-[7%] pt-12 lg:flex" aria-label="Site">
      <div className="flex items-center gap-10">
        <Link to="/" className={link}>Home</Link>
        <Link to="/terms" className={link}>About</Link>
        <Link to="/privacy" className={link}>Blog</Link>
        <Link to="/premium" className={link}>Pages</Link>
        <Link to="/settings" className={link}>Contact</Link>
      </div>
      <div className="flex items-center gap-7">
        <span className="flex items-center gap-1 text-[13px] text-neutral-200">English <ChevronDown className="h-3.5 w-3.5" /></span>
        <Link to="/login" className={`relative pb-1 text-[13px] font-semibold text-white ${signIn ? "after:absolute after:inset-x-1 after:-bottom-0.5 after:h-[2px] after:rounded after:bg-white" : "text-neutral-300"}`}>Sign in</Link>
        <Link to="/register" className={`rounded-full px-5 py-2 text-[13px] font-semibold transition ${register ? "bg-white text-black" : "bg-white text-black hover:bg-neutral-200"}`}>Register</Link>
      </div>
    </nav>
  );
}

export default function AuthLayout({ title, desktopTitle, subtitle, footer, children, hideLegal = false }) {
  return (
    <div className="auth-root relative overflow-x-hidden bg-black text-white lg:bg-black">
      {/* backgrounds */}
      <div className="auth-aurora pointer-events-none lg:hidden" aria-hidden="true" />
      <img src="/auth-helmet.jpg" alt="" aria-hidden="true" className="auth-art-glow pointer-events-none absolute left-[18%] top-[-8%] hidden w-[1000px] max-w-none -translate-x-1/2 opacity-35 lg:block" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full flex-col lg:max-w-[1400px] lg:justify-center lg:px-10 lg:py-10">
        <div className="flex flex-1 flex-col lg:min-h-[720px] lg:flex-none lg:overflow-hidden lg:rounded-[28px] lg:border-2 lg:border-white/25 lg:bg-black/60 lg:backdrop-blur-md">
          <DesktopNav />
          <div className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
            {/* desktop art */}
            <div className="relative hidden flex-1 items-end justify-center overflow-hidden lg:flex" aria-hidden="true">
              <img src="/auth-helmet.jpg" alt="" className="auth-art-mask h-full max-h-[640px] w-full object-cover object-center" />
            </div>

            {/* form column */}
            <div className="flex flex-1 flex-col px-5 pt-8 min-[420px]:px-6 min-[420px]:pt-12 sm:px-10 lg:items-center lg:justify-center lg:px-0 lg:pb-12 lg:pt-6">
              <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col lg:max-w-[320px] lg:flex-none">
                <Brand />
                <div className="mt-8 text-center min-[420px]:mt-14 lg:mt-0">
                  <h1 className="mx-auto text-[24px] font-bold min-[420px]:text-[28px] leading-[1.15] tracking-tight text-white lg:max-w-none lg:text-[26px] lg:tracking-wide">
                    <span className="whitespace-pre-line lg:hidden">{title}</span>
                    <span className="hidden whitespace-pre-line lg:inline">{desktopTitle || title}</span>
                  </h1>
                  {subtitle && <p className="mt-2 text-sm text-neutral-400">{subtitle}</p>}
                </div>
                <div className="mt-6 min-[420px]:mt-8 lg:mt-7">{children}</div>
                <div className="flex-1 lg:hidden" />
                {footer && (
                  <p className="auth-safe-bottom mt-6 pt-4 text-center text-[14px] text-neutral-400 min-[420px]:mt-8 min-[420px]:text-[15px] lg:mt-8 lg:pb-0 lg:text-[14px] [&_a]:!font-semibold [&_a]:!text-white [&_a]:no-underline lg:[&_a]:!font-bold">
                    {footer}
                  </p>
                )}
                {!hideLegal && (
                  <p className={`text-center text-xs text-neutral-600 ${footer ? "pb-6 lg:pb-0" : "auth-safe-bottom mt-8"} lg:mt-3`}>
                    By continuing, you agree to Xyron's{" "}
                    <Link to="/terms" className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-400">Terms</Link>
                    {" "}and{" "}
                    <Link to="/privacy" className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-400">Privacy Policy</Link>.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

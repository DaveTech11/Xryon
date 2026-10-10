import React from "react";
import { Link } from "react-router-dom";
import AuthMark from "./AuthMark";
import AuthBrandPanel from "./AuthBrandPanel";

// Phone / tablet: the original centered card.
// Laptop (lg+): logo top-left, a headline over the sign-in card on the left, and a tall
// picture card (the Xyron X + typing text) on the right, all centered as one block.
export default function AuthLayout({ title, subtitle, footer, children, hideLegal = false }) {
  return (
    <div className="auth-bg auth-split relative flex min-h-screen flex-col">
      <Link to="/" className="absolute left-8 top-7 z-10 hidden items-center gap-2.5 text-white lg:flex xl:left-[8%]" aria-label="Xyron home">
        <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden="true"><path d="M12 12 L45 50 L12 88 L28 88 L53 58 L78 88 L94 88 L61 50 L94 12 L78 12 L53 42 L28 12 Z" fill="#fff" /></svg>
        <span className="text-xl font-semibold tracking-tight">Xyron</span>
      </Link>

      <div className="mx-auto flex w-full max-w-[1180px] flex-1 items-center justify-center gap-10 px-4 py-10 lg:gap-12 lg:px-10 lg:py-16 xl:gap-20">
        <div className="relative w-full max-w-md lg:max-w-[440px] lg:shrink-0">
          <div className="mb-8 text-center lg:hidden">
            <AuthMark />
          </div>

          <div className="mb-8 hidden text-center lg:block">
            <h2 className="font-display text-[44px] font-medium leading-[1.08] tracking-tight text-white">Your AI,<br />built for you</h2>
            <p className="mt-4 text-lg text-neutral-300">Ask, build and create with Xyron</p>
          </div>

          <div className="auth-card px-6 py-8 sm:px-8">
            <div className="mb-6 text-center">
              <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm text-neutral-400">{subtitle}</p>}
            </div>
            {children}
          </div>
          {footer && <p className="mt-6 text-center text-sm text-neutral-500">{footer}</p>}
          {!hideLegal && (
            <p className="mt-3 text-center text-xs text-neutral-600">
              By continuing, you agree to Xyron's{" "}
              <Link to="/terms" className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-400">Terms</Link>
              {" "}and{" "}
              <Link to="/privacy" className="underline decoration-neutral-700 underline-offset-2 hover:text-neutral-400">Privacy Policy</Link>.
            </p>
          )}
        </div>

        <AuthBrandPanel />
      </div>
    </div>
  );
}

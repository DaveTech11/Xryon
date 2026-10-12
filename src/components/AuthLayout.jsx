import React from "react";
import { Link } from "react-router-dom";
import AuthMark from "./AuthMark";

export default function AuthLayout({ title, subtitle, footer, children, hideLegal = false }) {
  return (
    <div className="auth-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <AuthMark />
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
    </div>
  );
}

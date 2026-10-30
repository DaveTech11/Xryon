import React from "react";

/**
 * Prevents an unexpected Codex render exception from turning the entire route
 * into a blank black screen. The details are shown locally for troubleshooting.
 */
export default class CodexErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[Xyron Codex render error]", error, info?.componentStack || "");
  }

  render() {
    if (this.state.error) {
      const message = this.state.error?.message || String(this.state.error);
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#212121] p-6 text-white">
          <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#262626] p-6">
            <h1 className="text-xl font-semibold">Codex couldn't load this workspace</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-300">
              A page error interrupted the workspace. Your project files have not been deleted.
              Reload the page and try again. If it happens again, share the error below.
            </p>
            <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-xs text-amber-200">{message}</pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
            >
              Reload Codex
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

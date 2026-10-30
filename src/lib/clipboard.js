// Clipboard API first (works on Chrome/Edge/Safari/Android/iOS Safari over
// HTTPS), falling back to a hidden-textarea + execCommand for contexts where
// the Clipboard API is unavailable or permission is denied. Same approach as
// MessageActions.jsx, pulled out so any copy button can reuse it.
function legacyCopy(text) {
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("execCommand copy failed"));
    } catch (err) {
      reject(err);
    }
  });
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // permission denied or blocked — fall through to the legacy path
    }
  }
  await legacyCopy(text);
}

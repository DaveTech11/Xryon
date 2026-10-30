import React from "react";

// A person's own attached file, shown in the chat as a small pill (file name only), the same look as in the message box.
export default function FileAttachmentCard({ name, url, loading = false }) {
  const body = (
    <>
      <span className="truncate">{name}</span>
      {loading && <span role="status" aria-label="Uploading" className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white" />}
    </>
  );
  const cls = "inline-flex max-w-[260px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3.5 py-1.5 text-sm text-neutral-200 transition hover:bg-white/[0.11]";
  return url && !loading
    ? <a href={url} target="_blank" rel="noreferrer" className={cls} aria-label={`Open ${name}`}>{body}</a>
    : <div className={cls}>{body}</div>;
}

import React from "react";

// The card a person's own attached file shows as in the chat: name on top, type tag at the foot.
export default function FileAttachmentCard({ name, label, url }) {
  const body = (
    <>
      <span className="line-clamp-3 break-all text-[15px] font-medium leading-snug text-white">{name}</span>
      <span className="mt-3 inline-flex w-fit rounded-md bg-white/[0.09] px-2 py-0.5 text-xs font-medium tracking-wide text-neutral-300">{label}</span>
    </>
  );
  const cls = "flex min-h-[7.5rem] w-40 flex-col justify-between rounded-2xl border border-white/15 bg-[#161616] p-3 text-left transition hover:bg-[#1d1d1d]";
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className={cls} aria-label={`Open ${name}`}>{body}</a>
    : <div className={cls}>{body}</div>;
}

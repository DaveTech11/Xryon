import React, { useEffect, useRef, useState } from "react";
import {
  Type, Bold, Italic, List, ListOrdered, ListChecks, Table2, Link2, Code2, Quote, Minus, ChevronRight, Heading as HeadingIcon, SquareCode,
} from "lucide-react";

// Formatting bar shown when the chat box is expanded. It only inserts Markdown through onFormat(kind); the chat already
// renders Markdown. Buttons keep the text box focused (onMouseDown preventDefault) so the selection is not lost.
const keep = (e) => e.preventDefault();
const pill = "flex h-9 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-1";
const iconBtn = "flex h-8 w-8 items-center justify-center rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white active:scale-95";
const menuCls = "absolute left-0 top-full z-40 mt-2 w-56 rounded-2xl border border-white/10 bg-[#262626] p-1.5 shadow-2xl shadow-black/50";
const itemCls = "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-white/10";

export default function ComposerFormatBar({ onFormat }) {
  const [menu, setMenu] = useState(null); // null | "text" | "list"
  const [headings, setHeadings] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) { setMenu(null); setHeadings(false); } };
    const esc = (e) => { if (e.key === "Escape") { setMenu(null); setHeadings(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("touchstart", away);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("touchstart", away); window.removeEventListener("keydown", esc); };
  }, [menu]);

  const run = (kind) => { onFormat(kind); setMenu(null); setHeadings(false); };

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-2 px-1 pb-2" role="toolbar" aria-label="Text formatting">
      <div className={pill}>
        <div className="relative">
          <button type="button" onMouseDown={keep} onClick={() => { setMenu(menu === "text" ? null : "text"); setHeadings(false); }} aria-haspopup="menu" aria-expanded={menu === "text"} title="Text style" aria-label="Text style" className={`${iconBtn} ${menu === "text" ? "bg-white/10 text-white" : ""}`}>
            <Type className="h-[18px] w-[18px]" />
          </button>
          {menu === "text" && (
            <div className={menuCls} role="menu">
              <button type="button" onMouseDown={keep} onClick={() => setHeadings((h) => !h)} className={`${itemCls} ${headings ? "bg-white/10" : ""}`} role="menuitem" aria-haspopup="menu" aria-expanded={headings}>
                <HeadingIcon className="h-4 w-4" /> <span className="flex-1">Heading</span> <ChevronRight className="h-4 w-4 text-neutral-500" />
              </button>
              {headings && (
                <div className="mx-1 mb-1 grid grid-cols-3 gap-1 rounded-xl bg-black/20 p-1.5">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button key={n} type="button" onMouseDown={keep} onClick={() => run(`h${n}`)} className="rounded-lg py-1.5 text-sm font-semibold text-neutral-200 transition hover:bg-white/10" title={`Heading ${n}`} aria-label={`Heading ${n}`}>H{n}</button>
                  ))}
                </div>
              )}
              <button type="button" onMouseDown={keep} onClick={() => run("text")} className={itemCls} role="menuitem"><Type className="h-4 w-4 text-sky-400" /> <span className="text-sky-400">Text</span></button>
              <button type="button" onMouseDown={keep} onClick={() => run("quote")} className={itemCls} role="menuitem"><Quote className="h-4 w-4" /> Quote</button>
              <button type="button" onMouseDown={keep} onClick={() => run("codeblock")} className={itemCls} role="menuitem"><SquareCode className="h-4 w-4" /> Code block</button>
              <button type="button" onMouseDown={keep} onClick={() => run("divider")} className={itemCls} role="menuitem"><Minus className="h-4 w-4" /> Divider</button>
            </div>
          )}
        </div>
        <button type="button" onMouseDown={keep} onClick={() => run("bold")} className={iconBtn} title="Bold (Ctrl+B)" aria-label="Bold"><Bold className="h-[18px] w-[18px]" /></button>
        <button type="button" onMouseDown={keep} onClick={() => run("italic")} className={iconBtn} title="Italic (Ctrl+I)" aria-label="Italic"><Italic className="h-[18px] w-[18px]" /></button>
        <button type="button" onMouseDown={keep} onClick={() => run("code")} className={iconBtn} title="Inline code" aria-label="Inline code"><Code2 className="h-[18px] w-[18px]" /></button>
        <div className="relative">
          <button type="button" onMouseDown={keep} onClick={() => { setMenu(menu === "list" ? null : "list"); setHeadings(false); }} aria-haspopup="menu" aria-expanded={menu === "list"} title="Lists" aria-label="Lists" className={`${iconBtn} ${menu === "list" ? "bg-white/10 text-white" : ""}`}>
            <List className="h-[18px] w-[18px]" />
          </button>
          {menu === "list" && (
            <div className={menuCls} role="menu">
              <button type="button" onMouseDown={keep} onClick={() => run("bullet")} className={itemCls} role="menuitem"><List className="h-4 w-4" /> Bulleted list</button>
              <button type="button" onMouseDown={keep} onClick={() => run("numbered")} className={itemCls} role="menuitem"><ListOrdered className="h-4 w-4" /> Numbered list</button>
              <button type="button" onMouseDown={keep} onClick={() => run("task")} className={itemCls} role="menuitem"><ListChecks className="h-4 w-4" /> Checklist</button>
            </div>
          )}
        </div>
        <button type="button" onMouseDown={keep} onClick={() => run("table")} className={iconBtn} title="Table" aria-label="Insert table"><Table2 className="h-[18px] w-[18px]" /></button>
        <button type="button" onMouseDown={keep} onClick={() => run("link")} className={iconBtn} title="Link (Ctrl+K)" aria-label="Insert link"><Link2 className="h-[18px] w-[18px]" /></button>
      </div>
    </div>
  );
}

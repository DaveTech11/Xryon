import React from "react";

const CodeHighlight = React.forwardRef(function CodeHighlight({ code = "", language = "javascript" }, ref) {
  return (
    <pre
      ref={ref}
      className="xcode-scroll pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-sm leading-relaxed text-neutral-300 md:p-5"
    >
      <code>{code}</code>
    </pre>
  );
});

export default CodeHighlight;


import React, { useRef, useLayoutEffect } from "react";

/**
 * Textarea that auto-grows to fit its content — keeps long descriptions
 * fully visible while typing (and after AI generation), with no scrollbar.
 */
export default function AutoTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  minRows = 1,
  ...props
}) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 20; // matches h-10-ish row height
    const minH = minRows * lineHeight;
    el.style.height = Math.max(minH, el.scrollHeight) + "px";
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={minRows}
      className={`w-full border border-input bg-transparent rounded-md px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden ${className}`}
      {...props}
    />
  );
}
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface CommandSearchProps {
  /** Route the query submits to (GET-style navigation with ?<param>=). */
  readonly action: string;
  /** Placeholder / accessible label text. */
  readonly placeholder: string;
  /** Query param name the target surface reads. Defaults to "q". */
  readonly paramName?: string;
  /** Scope search class (e.g. "seekeros-search") — keeps the shell styling. */
  readonly className: string;
}

/**
 * The shell command bar — one real, keyboard-operable search for all three OSes.
 *
 * Replaces the dead `<div>` that previously sat in each topbar (it looked like a
 * search field but had no focus, no input, no action). This is a real GET form:
 * focusable, typeable, submits on Enter, and a global "/" shortcut focuses it
 * from anywhere in the scope — the command-center signature. Navigation uses the
 * router so it stays a client transition (and replays the view-enter).
 */
export function CommandSearch({
  action,
  placeholder,
  paramName = "q",
  className,
}: CommandSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  // "/" focuses the command bar from anywhere in the scope (unless the user is
  // already typing in a field). Escape blurs it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && el === inputRef.current) {
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className={className}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `${action}?${paramName}=${encodeURIComponent(q)}` : action);
      }}
    >
      <span className="cmdsearch-i" aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        type="search"
        name={paramName}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="cmdsearch-input"
        autoComplete="off"
        enterKeyHint="search"
      />
      <kbd className="cmdsearch-kbd" aria-hidden="true">/</kbd>
    </form>
  );
}

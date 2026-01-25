"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type SourcePopoverProps = {
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function SourcePopover({ label, children, className, style }: SourcePopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={className}
        style={{
          cursor: "pointer",
          color: "#2563eb",
          fontSize: 12,
          display: "inline-block",
          textDecoration: "underline",
          textUnderlineOffset: 2,
          background: "transparent",
          border: "none",
          padding: 0,
          ...style,
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {label}
      </button>

      {open ? children : null}
    </div>
  );
}

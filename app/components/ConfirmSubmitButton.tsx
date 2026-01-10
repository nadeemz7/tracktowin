"use client";

import type { CSSProperties, ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  confirmText: string;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

export default function ConfirmSubmitButton({
  confirmText,
  children,
  style,
  className,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      style={style}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

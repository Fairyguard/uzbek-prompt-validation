"use client";

import { MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function ConfirmPendingButton({
  children,
  confirmMessage,
  pendingLabel = "Deleting...",
  disabled = false,
  className,
}: {
  children: ReactNode;
  confirmMessage: string;
  pendingLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (disabled || pending) {
      return;
    }

    if (!window.confirm(confirmMessage)) {
      event.preventDefault();
    }
  }

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      onClick={handleClick}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300",
        className,
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

import { PromptStatus } from "@prisma/client";
import { STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<PromptStatus, string> = {
  PENDING_REVIEW: "bg-slate-100 text-slate-700 border-slate-200",
  IN_REVIEW: "bg-amber-100 text-amber-800 border-amber-200",
  REVIEWED: "bg-indigo-100 text-indigo-800 border-indigo-200",
  PENDING_INTENT_CHECK: "bg-cyan-100 text-cyan-800 border-cyan-200",
  IN_INTENT_CHECK: "bg-sky-100 text-sky-800 border-sky-200",
  INTENT_CHECKED: "bg-violet-100 text-violet-800 border-violet-200",
  PENDING_SPOT_CHECK: "bg-rose-100 text-rose-800 border-rose-200",
  APPROVED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NEEDS_REVISION: "bg-orange-100 text-orange-800 border-orange-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
};

export function StatusBadge({ status }: { status: PromptStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

type TaskProgressProps = {
  completedCount: number;
  remainingCount: number;
  totalCount: number;
};

export function TaskProgress({
  completedCount,
  remainingCount,
  totalCount,
}: TaskProgressProps) {
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="max-w-3xl rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p>
          Progress: <span className="font-semibold text-slate-900">{completedCount}</span> of{" "}
          <span className="font-semibold text-slate-900">{totalCount}</span> prompts completed
        </p>
        <p>
          <span className="font-semibold text-slate-900">{remainingCount}</span> prompts left
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-cyan-500 transition-all"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

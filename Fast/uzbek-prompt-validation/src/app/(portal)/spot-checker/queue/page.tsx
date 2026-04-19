import Link from "next/link";
import { AssignmentStatus, TaskType } from "@prisma/client";
import { NoticeBanner } from "@/components/notice-banner";
import { StatusBadge } from "@/components/status-badge";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SpotCheckerQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole("SPOT_CHECKER");
  const params = await searchParams;

  const assignments = await prisma.assignment.findMany({
    where: {
      userId: session.user.id,
      taskType: TaskType.SPOT_CHECK,
      status: {
        not: AssignmentStatus.COMPLETED,
      },
    },
    include: {
      prompt: {
        include: {
          dataset: true,
        },
      },
    },
    orderBy: {
      assignedAt: "asc",
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Spot-check queue</p>
        <h1 className="text-4xl text-slate-900">Escalated prompts</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Spot checks combine English source, final Uzbek text, reviewer outputs, and blind intent
          recovery results to make the final escalation decision.
        </p>
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <div className="grid gap-4">
        {assignments.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8 text-sm text-slate-600">
            No prompts are currently waiting on your spot check.
          </div>
        ) : null}

        {assignments.map((assignment) => (
          <article
            key={assignment.id}
            className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl text-slate-900">{assignment.prompt.promptId}</h2>
                  <StatusBadge status={assignment.prompt.status} />
                </div>
                <p className="text-sm text-slate-600">
                  Dataset: <span className="font-medium text-slate-900">{assignment.prompt.dataset.name}</span>
                </p>
                <p className="text-sm text-slate-600">
                  Category: <span className="font-medium text-slate-900">{assignment.prompt.category}</span>
                </p>
              </div>

              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>Assigned {formatDateTime(assignment.assignedAt)}</p>
                <Link
                  href={`/spot-checker/tasks/${assignment.id}`}
                  className="inline-flex rounded-full bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
                >
                  Open spot check
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

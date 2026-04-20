import Link from "next/link";
import { AssignmentStatus, TaskType } from "@prisma/client";
import { NoticeBanner } from "@/components/notice-banner";
import { StatusBadge } from "@/components/status-badge";
import { TaskProgress } from "@/components/task-progress";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/constants";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function IntentCheckerQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole("INTENT_CHECKER");
  const params = await searchParams;

  const [enabledDatasetCount, assignments, totalAssignments, remainingAssignments] = await Promise.all([
    prisma.datasetSettings.count({
      where: {
        intentCheckEnabled: true,
      },
    }),
    prisma.assignment.findMany({
      where: {
        userId: session.user.id,
        taskType: TaskType.INTENT_CHECK,
        status: {
          in: [...ACTIVE_ASSIGNMENT_STATUSES],
        },
      },
      include: {
        prompt: {
          include: {
            dataset: true,
            _count: {
              select: {
                intentChecks: true,
              },
            },
          },
        },
      },
      orderBy: {
        assignedAt: "asc",
      },
    }),
    prisma.assignment.count({
      where: {
        userId: session.user.id,
        taskType: TaskType.INTENT_CHECK,
        status: {
          not: AssignmentStatus.CANCELLED,
        },
      },
    }),
    prisma.assignment.count({
      where: {
        userId: session.user.id,
        taskType: TaskType.INTENT_CHECK,
        status: {
          in: [...ACTIVE_ASSIGNMENT_STATUSES],
        },
      },
    }),
  ]);
  const completedAssignments = Math.max(totalAssignments - remainingAssignments, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Intent-check queue</p>
        <h1 className="text-4xl text-slate-900">Blind meaning recovery tasks</h1>
        <TaskProgress
          completedCount={completedAssignments}
          remainingCount={remainingAssignments}
          totalCount={totalAssignments}
        />
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Only the final Uzbek text is shown inside the task. Source English, reviewer labels, and
          intended intent are intentionally hidden.
        </p>
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      {enabledDatasetCount === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8 text-sm text-slate-600">
          Intent checking is currently turned off for all datasets.
        </div>
      ) : null}

      <div className="grid gap-4">
        {enabledDatasetCount > 0 && assignments.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8 text-sm text-slate-600">
            No intent-check tasks are currently assigned to you.
          </div>
        ) : null}

        {enabledDatasetCount > 0 &&
          assignments.map((assignment) => (
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
                  Category hidden inside task; see only the queue metadata here if needed.
                </p>
              </div>

              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  Intent checks:{" "}
                  <span className="font-semibold text-slate-900">
                    {assignment.prompt._count.intentChecks}/{assignment.prompt.requiredIntentChecks}
                  </span>
                </p>
                <p>Assigned {formatDateTime(assignment.assignedAt)}</p>
                <Link
                  href={`/intent-checker/tasks/${assignment.id}`}
                  className="inline-flex rounded-full bg-slate-900 px-4 py-2 font-medium text-white transition hover:bg-slate-700"
                >
                  Open task
                </Link>
              </div>
            </div>
          </article>
          ))}
      </div>
    </div>
  );
}

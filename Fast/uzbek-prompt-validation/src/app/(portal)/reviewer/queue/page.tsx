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

export default async function ReviewerQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireRole("REVIEWER");
  const params = await searchParams;

  const [assignments, totalAssignments, remainingAssignments] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        userId: session.user.id,
        taskType: TaskType.REVIEW,
        status: {
          in: [...ACTIVE_ASSIGNMENT_STATUSES],
        },
      },
      include: {
        prompt: {
          include: {
            dataset: {
              include: {
                settings: true,
              },
            },
            _count: {
              select: {
                reviews: true,
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
        taskType: TaskType.REVIEW,
        status: {
          not: AssignmentStatus.CANCELLED,
        },
      },
    }),
    prisma.assignment.count({
      where: {
        userId: session.user.id,
        taskType: TaskType.REVIEW,
        status: {
          in: [...ACTIVE_ASSIGNMENT_STATUSES],
        },
      },
    }),
  ]);
  const nextAssignment = assignments[0] ?? null;
  const completedAssignments = Math.max(totalAssignments - remainingAssignments, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Reviewer queue</p>
        <h1 className="text-4xl text-slate-900">Assigned review tasks</h1>
        <TaskProgress
          completedCount={completedAssignments}
          remainingCount={remainingAssignments}
          totalCount={totalAssignments}
        />
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Work from the assigned inbox only. Each prompt can appear once per reviewer, and reviewer
          assignments are separated from intent checking for the same prompt.
        </p>
        {nextAssignment ? (
          <div className="pt-2">
            <Link
              href={`/reviewer/tasks/${nextAssignment.id}`}
              className="inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Open task
            </Link>
          </div>
        ) : null}
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <div className="grid gap-4">
        {assignments.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8 text-sm text-slate-600">
            No review tasks are currently assigned to you.
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
                <p className="max-w-3xl text-sm leading-7 text-slate-700">
                  {assignment.prompt.englishPrompt}
                </p>
              </div>

              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p>
                  Reviews:{" "}
                  <span className="font-semibold text-slate-900">
                    {assignment.prompt._count.reviews}/{assignment.prompt.requiredReviews}
                  </span>
                </p>
                <p>Assigned {formatDateTime(assignment.assignedAt)}</p>
                <Link
                  href={`/reviewer/tasks/${assignment.id}`}
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

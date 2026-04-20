import { notFound, redirect } from "next/navigation";
import { AssignmentStatus, TaskType } from "@prisma/client";
import { submitReviewAction } from "@/app/actions";
import { NoticeBanner } from "@/components/notice-banner";
import { ReviewForm } from "@/components/review-form";
import { getReviewerExtraFactors } from "@/lib/constants";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { safeJsonParse } from "@/lib/utils";

type Params = Promise<{ assignmentId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ReviewerTaskPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await requireRole("REVIEWER");
  const { assignmentId } = await params;
  const query = await searchParams;

  const [assignment, totalAssignments, remainingAssignments] = await Promise.all([
    prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        prompt: {
          include: {
            dataset: {
              include: {
                settings: true,
              },
            },
          },
        },
        review: true,
      },
    }),
    prisma.assignment.count({
      where: {
        userId: session.user.id,
        taskType: TaskType.REVIEW,
      },
    }),
    prisma.assignment.count({
      where: {
        userId: session.user.id,
        taskType: TaskType.REVIEW,
        status: {
          not: AssignmentStatus.COMPLETED,
        },
      },
    }),
  ]);

  if (
    !assignment ||
    assignment.userId !== session.user.id ||
    assignment.taskType !== TaskType.REVIEW
  ) {
    notFound();
  }

  if (assignment.status === AssignmentStatus.COMPLETED || assignment.review) {
    redirect("/reviewer/queue");
  }

  const extraFactors = getReviewerExtraFactors(
    safeJsonParse<Array<{ key: string; label: string }>>(
      assignment.prompt.dataset.settings?.extraSafetyFactors ?? "[]",
      [],
    ),
  );
  const completedAssignments = Math.max(totalAssignments - remainingAssignments, 0);
  const progressPercent =
    totalAssignments > 0 ? Math.round((completedAssignments / totalAssignments) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Review task</p>
        <h1 className="text-4xl text-slate-900">{assignment.prompt.promptId}</h1>
        <p className="max-w-3xl rounded-3xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm leading-7 text-cyan-900">
          {assignment.prompt.dataset.settings?.reviewInstructions}
        </p>
        <div className="max-w-3xl rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>
              Progress: <span className="font-semibold text-slate-900">{completedAssignments}</span> of{" "}
              <span className="font-semibold text-slate-900">{totalAssignments}</span> prompts completed
            </p>
            <p>
              <span className="font-semibold text-slate-900">{remainingAssignments}</span> prompts left
            </p>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-cyan-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <NoticeBanner
        notice={typeof query.notice === "string" ? query.notice : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Source</p>
          <div className="mt-5 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">English prompt</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {assignment.prompt.englishPrompt}
              </p>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">MT Uzbek prompt</h2>
              <p className="mt-3 whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {assignment.prompt.mtUzbekPrompt}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <ReviewForm
            assignmentId={assignment.id}
            initialUzbekPrompt={assignment.prompt.mtUzbekPrompt}
            extraFactors={extraFactors}
            action={submitReviewAction}
          />
        </section>
      </div>
    </div>
  );
}

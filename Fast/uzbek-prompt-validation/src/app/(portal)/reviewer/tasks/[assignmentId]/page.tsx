import { notFound, redirect } from "next/navigation";
import { AssignmentStatus, TaskType } from "@prisma/client";
import { submitReviewAction } from "@/app/actions";
import { NoticeBanner } from "@/components/notice-banner";
import { ReviewForm } from "@/components/review-form";
import { TaskProgress } from "@/components/task-progress";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  isActiveAssignmentStatus,
  resolveReviewQuestions,
} from "@/lib/constants";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getCurrentReviewPrompt } from "@/lib/workflow-rules";

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
            reviews: {
              orderBy: {
                createdAt: "asc",
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

  if (
    !assignment ||
    assignment.userId !== session.user.id ||
    assignment.taskType !== TaskType.REVIEW
  ) {
    notFound();
  }

  if (!isActiveAssignmentStatus(assignment.status) || assignment.review) {
    redirect("/reviewer/queue");
  }

  const reviewQuestions = resolveReviewQuestions(
    assignment.prompt.dataset.settings?.reviewQuestions,
    assignment.prompt.dataset.settings?.extraSafetyFactors,
  );
  const currentReviewPrompt = getCurrentReviewPrompt(
    assignment.prompt.reviews,
    assignment.prompt.mtUzbekPrompt,
    assignment.prompt.canonicalUzbekPrompt,
  );
  const completedAssignments = Math.max(totalAssignments - remainingAssignments, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Review task</p>
        <h1 className="text-4xl text-slate-900">{assignment.prompt.promptId}</h1>
        <TaskProgress
          completedCount={completedAssignments}
          remainingCount={remainingAssignments}
          totalCount={totalAssignments}
        />
        <p className="max-w-3xl rounded-3xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm leading-7 text-cyan-900">
          {assignment.prompt.dataset.settings?.reviewInstructions}
        </p>
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
              <h2 className="text-lg font-semibold text-slate-900">Current Uzbek prompt</h2>
              <p className="mt-3 whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {currentReviewPrompt}
              </p>
            </div>
            {currentReviewPrompt !== assignment.prompt.mtUzbekPrompt ? (
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Original MT Uzbek prompt</h2>
                <p className="mt-3 whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  {assignment.prompt.mtUzbekPrompt}
                </p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <ReviewForm
            assignmentId={assignment.id}
            initialUzbekPrompt={currentReviewPrompt}
            reviewQuestions={reviewQuestions}
            action={submitReviewAction}
          />
        </section>
      </div>
    </div>
  );
}

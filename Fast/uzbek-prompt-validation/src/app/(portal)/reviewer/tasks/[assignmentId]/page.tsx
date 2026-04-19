import { notFound, redirect } from "next/navigation";
import { AssignmentStatus, TaskType } from "@prisma/client";
import { submitReviewAction } from "@/app/actions";
import { ReviewForm } from "@/components/review-form";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { safeJsonParse } from "@/lib/utils";

type Params = Promise<{ assignmentId: string }>;

export default async function ReviewerTaskPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireRole("REVIEWER");
  const { assignmentId } = await params;

  const assignment = await prisma.assignment.findUnique({
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
  });

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

  const extraFactors = safeJsonParse<Array<{ key: string; label: string }>>(
    assignment.prompt.dataset.settings?.extraSafetyFactors ?? "[]",
    [],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Review task</p>
        <h1 className="text-4xl text-slate-900">{assignment.prompt.promptId}</h1>
        <p className="max-w-3xl rounded-3xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm leading-7 text-cyan-900">
          {assignment.prompt.dataset.settings?.reviewInstructions}
        </p>
      </div>

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

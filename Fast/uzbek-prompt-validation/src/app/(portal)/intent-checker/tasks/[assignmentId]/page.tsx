import { notFound, redirect } from "next/navigation";
import { AssignmentStatus, TaskType } from "@prisma/client";
import { submitIntentCheckAction } from "@/app/actions";
import { PendingButton } from "@/components/pending-button";
import { TaskProgress } from "@/components/task-progress";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  INTENT_CONFIDENCE_OPTIONS,
  isActiveAssignmentStatus,
} from "@/lib/constants";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ assignmentId: string }>;

export default async function IntentCheckerTaskPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireRole("INTENT_CHECKER");
  const { assignmentId } = await params;

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
        intentCheck: true,
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

  if (
    !assignment ||
    assignment.userId !== session.user.id ||
    assignment.taskType !== TaskType.INTENT_CHECK
  ) {
    notFound();
  }

  if (!isActiveAssignmentStatus(assignment.status) || assignment.intentCheck) {
    redirect("/intent-checker/queue");
  }

  if (!assignment.prompt.dataset.settings?.intentCheckEnabled) {
    redirect("/intent-checker/queue?notice=Intent%20checking%20is%20currently%20turned%20off.");
  }

  const completedAssignments = Math.max(totalAssignments - remainingAssignments, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Blind intent check</p>
        <h1 className="text-4xl text-slate-900">{assignment.prompt.promptId}</h1>
        <TaskProgress
          completedCount={completedAssignments}
          remainingCount={remainingAssignments}
          totalCount={totalAssignments}
        />
        <p className="rounded-3xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm leading-7 text-cyan-900">
          Recover the intended meaning using only the Uzbek text below. Do not infer from hidden
          metadata or speculate beyond what the prompt explicitly asks for.
        </p>
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Final Uzbek prompt</p>
        <p className="mt-4 whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-50 p-5 text-base leading-8 text-slate-800">
          {assignment.prompt.canonicalUzbekPrompt}
        </p>

        <form action={submitIntentCheckAction} className="mt-8 space-y-5">
          <input type="hidden" name="assignmentId" value={assignment.id} />

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="recoveredIntent">
              What is this asking for? (English summary)
            </label>
            <textarea
              id="recoveredIntent"
              name="recoveredIntent"
              required
              rows={4}
              className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-900"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="categoryGuess">
                Optional category guess
              </label>
              <input
                id="categoryGuess"
                name="categoryGuess"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="confidence">
                Confidence
              </label>
              <select
                id="confidence"
                name="confidence"
                required
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">Select...</option>
                {INTENT_CONFIDENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <PendingButton>Submit intent check</PendingButton>
          </div>
        </form>
      </section>
    </div>
  );
}

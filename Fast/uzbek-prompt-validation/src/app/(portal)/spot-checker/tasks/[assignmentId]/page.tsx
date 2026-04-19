import { notFound, redirect } from "next/navigation";
import { AssignmentStatus, TaskType } from "@prisma/client";
import { submitSpotCheckAction } from "@/app/actions";
import { PendingButton } from "@/components/pending-button";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SPOT_CHECK_ACTION_OPTIONS } from "@/lib/constants";
import { INTENT_MATCH_LABELS } from "@/lib/constants";
import { safeJsonParse } from "@/lib/utils";

type Params = Promise<{ assignmentId: string }>;

export default async function SpotCheckerTaskPage({
  params,
}: {
  params: Params;
}) {
  const session = await requireRole("SPOT_CHECKER");
  const { assignmentId } = await params;

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      prompt: {
        include: {
          reviews: {
            include: {
              reviewer: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          intentChecks: {
            include: {
              intentChecker: true,
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
      spotCheck: true,
    },
  });

  if (
    !assignment ||
    assignment.userId !== session.user.id ||
    assignment.taskType !== TaskType.SPOT_CHECK
  ) {
    notFound();
  }

  if (assignment.status === AssignmentStatus.COMPLETED || assignment.spotCheck) {
    redirect("/spot-checker/queue");
  }

  const escalationReasons = safeJsonParse<string[]>(
    assignment.prompt.escalationReasons ?? "[]",
    [],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Spot check</p>
        <h1 className="text-4xl text-slate-900">{assignment.prompt.promptId}</h1>
        <p className="max-w-4xl text-sm leading-7 text-slate-600">
          Use the full evidence packet below to decide whether the translation is acceptable, needs
          revision, or should be rejected.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="space-y-6">
          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl text-slate-900">Prompt evidence</h2>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">English prompt</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {assignment.prompt.englishPrompt}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Final Uzbek prompt</p>
                <p className="mt-3 whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  {assignment.prompt.canonicalUzbekPrompt}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Intended intent</p>
                <p className="mt-3 text-sm leading-6 text-slate-700">{assignment.prompt.intendedIntent ?? "—"}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Intent match</p>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {assignment.prompt.intentMatchStatus
                    ? INTENT_MATCH_LABELS[assignment.prompt.intentMatchStatus]
                    : "Not computed"}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Escalation flags</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {escalationReasons.length > 0 ? (
                    escalationReasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700"
                      >
                        {reason.replaceAll("_", " ")}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-slate-500">No escalation flags recorded.</span>
                  )}
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl text-slate-900">Reviewer results</h2>
            <div className="mt-4 grid gap-4">
              {assignment.prompt.reviews.map((review) => (
                <div key={review.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{review.reviewer.name}</p>
                    <p className="text-sm text-slate-500">{review.finalDecision}</p>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                    {review.editedUzbekPrompt}
                  </p>
                  <div className="mt-4 grid gap-2 text-xs uppercase tracking-[0.16em] text-slate-500 md:grid-cols-3">
                    <span>Intent: {review.intentMatchesOriginal}</span>
                    <span>Clarity: {review.meaningClarity}</span>
                    <span>Drift: {review.meaningDrift}</span>
                    <span>Naturalness: {review.naturalness}</span>
                    <span>Category: {review.harmCategoryMatches}</span>
                    <span>Strength: {review.strengthOfRequest}</span>
                  </div>
                  {review.notes ? (
                    <p className="mt-4 text-sm leading-6 text-slate-600">Notes: {review.notes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl text-slate-900">Intent-check results</h2>
            <div className="mt-4 grid gap-4">
              {assignment.prompt.intentChecks.map((intentCheck) => (
                <div key={intentCheck.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{intentCheck.intentChecker.name}</p>
                    <p className="text-sm text-slate-500">{intentCheck.confidence}</p>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{intentCheck.recoveredIntent}</p>
                  <div className="mt-4 grid gap-2 text-xs uppercase tracking-[0.16em] text-slate-500 md:grid-cols-2">
                    <span>Category guess: {intentCheck.categoryGuess ?? "—"}</span>
                    <span>Match status: {intentCheck.matchStatus ?? "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl text-slate-900">Decision</h2>
          <form action={submitSpotCheckAction} className="mt-6 space-y-5">
            <input type="hidden" name="assignmentId" value={assignment.id} />

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="action">
                Spot-check result
              </label>
              <select
                id="action"
                name="action"
                required
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">Select…</option>
                {SPOT_CHECK_ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700" htmlFor="notes">
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={6}
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-900"
              />
            </div>

            <div className="flex justify-end">
              <PendingButton>Submit spot check</PendingButton>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}

import { FinalDecision, TaskType } from "@prisma/client";
import {
  forceSpotCheckAction,
  manualAssignAction,
  overridePromptStatusAction,
  requestExtraReviewAction,
  setCanonicalPromptAction,
} from "@/app/actions";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { StatusBadge } from "@/components/status-badge";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

type Params = Promise<{ promptId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminPromptDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireRole("ADMIN");
  const { promptId } = await params;
  const query = await searchParams;

  const [prompt, users] = await Promise.all([
    prisma.prompt.findUnique({
      where: { id: promptId },
      include: {
        dataset: {
          include: {
            settings: true,
          },
        },
        reviews: {
          include: {
            reviewer: true,
          },
          orderBy: { createdAt: "asc" },
        },
        intentChecks: {
          include: {
            intentChecker: true,
          },
          orderBy: { createdAt: "asc" },
        },
        spotChecks: {
          include: {
            spotChecker: true,
          },
          orderBy: { createdAt: "asc" },
        },
        assignments: {
          include: {
            user: true,
          },
          orderBy: { assignedAt: "asc" },
        },
        auditLogs: {
          include: {
            actor: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!prompt) {
    return <div className="text-sm text-slate-600">Prompt not found.</div>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Prompt detail</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl text-slate-900">{prompt.promptId}</h1>
          <StatusBadge status={prompt.status} />
        </div>
        <p className="text-sm text-slate-600">
          Dataset: <span className="font-medium text-slate-900">{prompt.dataset.name}</span> · Category:{" "}
          <span className="font-medium text-slate-900">{prompt.category}</span>
        </p>
      </div>

      <NoticeBanner
        notice={typeof query.notice === "string" ? query.notice : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl text-slate-900">Prompt texts</h2>
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">English prompt</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {prompt.englishPrompt}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">MT Uzbek prompt</p>
              <p className="mt-3 whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {prompt.mtUzbekPrompt}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Canonical Uzbek prompt</p>
              <p className="mt-3 whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {prompt.canonicalUzbekPrompt ?? "Not selected yet"}
              </p>
            </div>
          </div>
        </article>

        <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl text-slate-900">Controls</h2>
          <div className="mt-6 grid gap-4">
            <form action={manualAssignAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <input type="hidden" name="returnTo" value={`/admin/prompts/${prompt.id}`} />
              <input type="hidden" name="promptId" value={prompt.id} />
              <p className="text-sm font-semibold text-slate-900">Manual assignment</p>
              <div className="mt-4 grid gap-3">
                <select
                  name="userId"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <select
                  name="taskType"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                >
                  {Object.values(TaskType).map((taskType) => (
                    <option key={taskType} value={taskType}>
                      {taskType}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" name="overrideLimit" />
                  Allow override
                </label>
              </div>
              <div className="mt-4 flex justify-end">
                <PendingButton>Assign</PendingButton>
              </div>
            </form>

            <form action={setCanonicalPromptAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <input type="hidden" name="returnTo" value={`/admin/prompts/${prompt.id}`} />
              <input type="hidden" name="promptId" value={prompt.id} />
              <p className="text-sm font-semibold text-slate-900">Set canonical Uzbek</p>
              <textarea
                name="canonicalUzbekPrompt"
                rows={5}
                defaultValue={prompt.canonicalUzbekPrompt ?? ""}
                className="mt-4 w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-900"
              />
              <div className="mt-4 flex justify-end">
                <PendingButton>Save canonical text</PendingButton>
              </div>
            </form>

            <div className="grid gap-4 md:grid-cols-3">
              <form action={forceSpotCheckAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <input type="hidden" name="returnTo" value={`/admin/prompts/${prompt.id}`} />
                <input type="hidden" name="promptId" value={prompt.id} />
                <p className="text-sm font-semibold text-slate-900">Force spot check</p>
                <div className="mt-4 flex justify-end">
                  <PendingButton>Send</PendingButton>
                </div>
              </form>
              <form action={requestExtraReviewAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <input type="hidden" name="returnTo" value={`/admin/prompts/${prompt.id}`} />
                <input type="hidden" name="promptId" value={prompt.id} />
                <p className="text-sm font-semibold text-slate-900">Request extra review</p>
                <div className="mt-4 flex justify-end">
                  <PendingButton>Request</PendingButton>
                </div>
              </form>
              <form action={overridePromptStatusAction} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <input type="hidden" name="returnTo" value={`/admin/prompts/${prompt.id}`} />
                <input type="hidden" name="promptId" value={prompt.id} />
                <p className="text-sm font-semibold text-slate-900">Override final status</p>
                <select
                  name="finalDecision"
                  className="mt-4 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                >
                  {Object.values(FinalDecision).map((decision) => (
                    <option key={decision} value={decision}>
                      {decision}
                    </option>
                  ))}
                </select>
                <div className="mt-4 flex justify-end">
                  <PendingButton>Override</PendingButton>
                </div>
              </form>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl text-slate-900">Reviews</h2>
          <div className="mt-4 grid gap-3">
            {prompt.reviews.map((review) => (
              <div key={review.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{review.reviewer.name}</p>
                  <p className="text-sm text-slate-500">{review.finalDecision}</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-700">{review.editedUzbekPrompt}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {review.intentMatchesOriginal} · {review.meaningClarity} · {review.naturalness} ·{" "}
                  {review.meaningDrift}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl text-slate-900">Intent checks</h2>
          <div className="mt-4 grid gap-3">
            {prompt.intentChecks.map((check) => (
              <div key={check.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{check.intentChecker.name}</p>
                  <p className="text-sm text-slate-500">{check.confidence}</p>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-700">{check.recoveredIntent}</p>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {check.categoryGuess ?? "No category guess"} · {check.matchStatus ?? "Not matched"}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl text-slate-900">Spot checks and history</h2>
          <div className="mt-4 grid gap-3">
            {prompt.spotChecks.map((spotCheck) => (
              <div key={spotCheck.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{spotCheck.spotChecker.name}</p>
                  <p className="text-sm text-slate-500">{spotCheck.action}</p>
                </div>
                {spotCheck.notes ? (
                  <p className="mt-3 text-sm leading-7 text-slate-700">{spotCheck.notes}</p>
                ) : null}
              </div>
            ))}

            {prompt.auditLogs.map((log) => (
              <div key={log.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {log.action.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {log.actor?.name ?? "System"} · {formatDateTime(log.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl text-slate-900">Assignments</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prompt.assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td className="px-4 py-3 text-slate-700">{assignment.user.name}</td>
                  <td className="px-4 py-3 text-slate-700">{assignment.taskType}</td>
                  <td className="px-4 py-3 text-slate-700">{assignment.status}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(assignment.assignedAt)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(assignment.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

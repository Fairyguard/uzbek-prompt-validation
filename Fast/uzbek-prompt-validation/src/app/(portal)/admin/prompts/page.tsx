import Link from "next/link";
import { Prisma, PromptStatus, TaskType } from "@prisma/client";
import { autoAssignAction } from "@/app/actions";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { StatusBadge } from "@/components/status-badge";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getStringParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default async function AdminPromptsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  const datasetId = getStringParam(params, "datasetId");
  const status = getStringParam(params, "status");
  const category = getStringParam(params, "category");
  const reviewerId = getStringParam(params, "reviewerId");
  const intentCheckerId = getStringParam(params, "intentCheckerId");
  const spotCheckerId = getStringParam(params, "spotCheckerId");
  const mismatchOnly = getStringParam(params, "mismatchOnly") === "true";
  const notSureOnly = getStringParam(params, "notSureOnly") === "true";
  const lowConfidenceOnly = getStringParam(params, "lowConfidenceOnly") === "true";
  const sentToSpotCheckOnly = getStringParam(params, "sentToSpotCheckOnly") === "true";
  const needsRevisionOnly = getStringParam(params, "needsRevisionOnly") === "true";

  const where: Prisma.PromptWhereInput = {
    ...(datasetId ? { datasetId } : {}),
    ...(status ? { status: status as PromptStatus } : {}),
    ...(category ? { category } : {}),
    ...(reviewerId ? { reviews: { some: { reviewerId } } } : {}),
    ...(intentCheckerId ? { intentChecks: { some: { intentCheckerId } } } : {}),
    ...(spotCheckerId ? { spotChecks: { some: { spotCheckerId } } } : {}),
    ...(mismatchOnly ? { mismatchFlag: true } : {}),
    ...(notSureOnly ? { notSureFlag: true } : {}),
    ...(lowConfidenceOnly ? { lowConfidenceFlag: true } : {}),
    ...(sentToSpotCheckOnly ? { spotCheckRequired: true } : {}),
    ...(needsRevisionOnly ? { status: PromptStatus.NEEDS_REVISION } : {}),
  };

  const [datasets, users, prompts] = await Promise.all([
    prisma.dataset.findMany({
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.prompt.findMany({
      where,
      include: {
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        intentChecks: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        spotChecks: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            reviews: true,
            intentChecks: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Prompts</p>
        <h1 className="text-4xl text-slate-900">Prompt table and assignment controls</h1>
        <p className="max-w-4xl text-sm leading-7 text-slate-600">
          Filter prompts by evaluator, category, status, mismatch, and confidence. Use the table to
          inspect progress and open detailed annotation records.
        </p>
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <form className="grid gap-4 lg:grid-cols-4">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Dataset
              <select
                name="datasetId"
                defaultValue={datasetId ?? ""}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">All datasets</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Status
              <select
                name="status"
                defaultValue={status ?? ""}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">All</option>
                {Object.values(PromptStatus).map((promptStatus) => (
                  <option key={promptStatus} value={promptStatus}>
                    {promptStatus}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Category
              <input
                name="category"
                defaultValue={category ?? ""}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Reviewer
              <select
                name="reviewerId"
                defaultValue={reviewerId ?? ""}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">Any</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Intent checker
              <select
                name="intentCheckerId"
                defaultValue={intentCheckerId ?? ""}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">Any</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              Spot checker
              <select
                name="spotCheckerId"
                defaultValue={spotCheckerId ?? ""}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
              >
                <option value="">Any</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 lg:col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="notSureOnly" value="true" defaultChecked={notSureOnly} />
                Not sure cases
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="mismatchOnly" value="true" defaultChecked={mismatchOnly} />
                Mismatch cases
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="lowConfidenceOnly"
                  value="true"
                  defaultChecked={lowConfidenceOnly}
                />
                Low confidence cases
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="sentToSpotCheckOnly"
                  value="true"
                  defaultChecked={sentToSpotCheckOnly}
                />
                Sent to spot check
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="needsRevisionOnly"
                  value="true"
                  defaultChecked={needsRevisionOnly}
                />
                Needs revision
              </label>
            </div>
            <div className="lg:col-span-4 flex gap-3">
              <button
                type="submit"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Apply filters
              </button>
              <Link
                href="/admin/prompts"
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
              >
                Clear
              </Link>
            </div>
          </form>

          <form action={autoAssignAction} className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
            <input type="hidden" name="returnTo" value="/admin/prompts" />
            <h2 className="text-xl text-slate-900">Auto-assign randomly</h2>
            <div className="mt-4 grid gap-4">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Dataset
                <select
                  name="datasetId"
                  defaultValue={datasetId ?? datasets[0]?.id}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                >
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Assignee
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
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Task type
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
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  Count
                  <input
                    name="count"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={5}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </label>
              </div>
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input type="checkbox" name="overrideLimit" />
                Allow override when required counts are already reached
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <PendingButton>Assign prompts</PendingButton>
            </div>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-5 py-4">Prompt</th>
                <th className="px-5 py-4">Category</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Reviews</th>
                <th className="px-5 py-4">Intent checks</th>
                <th className="px-5 py-4">Latest reviewer summary</th>
                <th className="px-5 py-4">Latest intent summary</th>
                <th className="px-5 py-4">Spot check result</th>
                <th className="px-5 py-4">Final status</th>
                <th className="px-5 py-4">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prompts.map((prompt) => (
                <tr key={prompt.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <Link href={`/admin/prompts/${prompt.id}`} className="font-semibold text-slate-900 underline-offset-4 hover:underline">
                      {prompt.promptId}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{prompt.category}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={prompt.status} />
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {prompt._count.reviews}/{prompt.requiredReviews}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {prompt._count.intentChecks}/{prompt.requiredIntentChecks}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {prompt.reviews[0]?.finalDecision ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {prompt.intentChecks[0]?.matchStatus ?? prompt.intentMatchStatus ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {prompt.spotChecks[0]?.action ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{prompt.finalDecision ?? "—"}</td>
                  <td className="px-5 py-4 text-slate-500">{formatDateTime(prompt.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

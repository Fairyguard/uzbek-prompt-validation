import Link from "next/link";
import { PromptStatus, Prisma } from "@prisma/client";
import { MetricCard } from "@/components/metric-card";
import { NoticeBanner } from "@/components/notice-banner";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function buildPromptFilter(datasetId?: string): Prisma.PromptWhereInput {
  return datasetId ? { datasetId } : {};
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const datasetId = typeof params.datasetId === "string" ? params.datasetId : undefined;
  const baseWhere = buildPromptFilter(datasetId);

  const [datasets, totalPrompts, statusCounts, notSureCases, mismatchCases, lowConfidenceCases] =
    await Promise.all([
      prisma.dataset.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.prompt.count({ where: baseWhere }),
      Promise.all(
        Object.values(PromptStatus).map(async (status) => [
          status,
          await prisma.prompt.count({
            where: {
              ...baseWhere,
              status,
            },
          }),
        ]),
      ),
      prisma.prompt.count({
        where: {
          ...baseWhere,
          notSureFlag: true,
        },
      }),
      prisma.prompt.count({
        where: {
          ...baseWhere,
          mismatchFlag: true,
        },
      }),
      prisma.prompt.count({
        where: {
          ...baseWhere,
          lowConfidenceFlag: true,
        },
      }),
    ]);

  const counts = Object.fromEntries(statusCounts) as Record<PromptStatus, number>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Admin dashboard</p>
          <h1 className="text-4xl text-slate-900">Research workflow overview</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Track prompt volumes, escalations, final decisions, and unresolved risk signals across
            imported datasets.
          </p>
        </div>

        <form className="flex flex-wrap gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Dataset
            <select
              name="datasetId"
              defaultValue={datasetId ?? ""}
              className="block min-w-56 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
            >
              <option value="">All datasets</option>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="self-end rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Apply
          </button>
        </form>
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total prompts" value={totalPrompts} />
        <MetricCard label="Pending review" value={counts.PENDING_REVIEW ?? 0} tone="amber" />
        <MetricCard label="In review" value={counts.IN_REVIEW ?? 0} tone="amber" />
        <MetricCard label="Reviewed" value={counts.REVIEWED ?? 0} tone="sky" />
        <MetricCard label="Pending intent check" value={counts.PENDING_INTENT_CHECK ?? 0} tone="sky" />
        <MetricCard label="In intent check" value={counts.IN_INTENT_CHECK ?? 0} tone="sky" />
        <MetricCard label="Intent checked" value={counts.INTENT_CHECKED ?? 0} tone="sky" />
        <MetricCard label="Pending spot check" value={counts.PENDING_SPOT_CHECK ?? 0} tone="rose" />
        <MetricCard label="Approved" value={counts.APPROVED ?? 0} tone="emerald" />
        <MetricCard label="Needs revision" value={counts.NEEDS_REVISION ?? 0} tone="amber" />
        <MetricCard label="Rejected" value={counts.REJECTED ?? 0} tone="rose" />
        <MetricCard label="Not sure cases" value={notSureCases} tone="rose" />
        <MetricCard label="Mismatch cases" value={mismatchCases} tone="rose" />
        <MetricCard label="Low confidence cases" value={lowConfidenceCases} tone="rose" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Link
          href="/admin/datasets"
          className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Datasets</p>
          <h2 className="mt-3 text-2xl text-slate-900">Import and export</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Upload XLSX prompt sets, inspect dataset settings, and download research-ready exports.
          </p>
        </Link>
        <Link
          href="/admin/prompts"
          className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Prompts</p>
          <h2 className="mt-3 text-2xl text-slate-900">Assignment and triage</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Filter by mismatch, reviewer, status, or low confidence, then assign or escalate work.
          </p>
        </Link>
        <Link
          href="/admin/users"
          className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Users</p>
          <h2 className="mt-3 text-2xl text-slate-900">Role administration</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Create demo and production accounts, grant multiple roles, and reset credentials.
          </p>
        </Link>
      </div>
    </div>
  );
}

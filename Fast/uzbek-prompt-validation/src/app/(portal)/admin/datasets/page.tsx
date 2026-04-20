import Link from "next/link";
import { deleteDatasetAction, importDatasetAction } from "@/app/actions";
import { ConfirmPendingButton } from "@/components/confirm-pending-button";
import { NoticeBanner } from "@/components/notice-banner";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/utils";
import { PendingButton } from "@/components/pending-button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminDatasetsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;

  const datasets = await prisma.dataset.findMany({
    include: {
      settings: true,
      _count: {
        select: {
          prompts: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Datasets</p>
        <h1 className="text-4xl text-slate-900">Import prompt datasets</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Upload English-Uzbek pairs from XLSX, configure per-dataset review settings, and export
          normalized annotation sheets for research analysis.
        </p>
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl text-slate-900">Import new dataset</h2>
        <form action={importDatasetAction} className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
          <input type="hidden" name="returnTo" value="/admin/datasets" />
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Dataset name
            <input
              name="name"
              required
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            Description
            <input
              name="description"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-slate-700">
            XLSX file
            <input
              name="file"
              type="file"
              accept=".xlsx,.xls"
              required
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
          </label>
          <div className="self-end">
            <PendingButton>Import</PendingButton>
          </div>
        </form>
        <p className="mt-4 text-sm text-slate-500">
          Required columns: <code>prompt_id</code>, <code>category</code>, <code>english_prompt</code>,{" "}
          <code>mt_uzbek_prompt</code>. Optional: <code>intended_intent</code>, <code>notes</code>.
        </p>
      </section>

      <div className="grid gap-4">
        {datasets.map((dataset) => (
          <article key={dataset.id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <h2 className="text-2xl text-slate-900">{dataset.name}</h2>
                <p className="text-sm text-slate-600">{dataset.description ?? "No description provided."}</p>
                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>{dataset._count.prompts} prompts</span>
                  <span>Imported {formatDateTime(dataset.createdAt)}</span>
                  <span>Source: {dataset.sourceFilename ?? "manual"}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/admin/settings?datasetId=${dataset.id}`}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
                >
                  Settings
                </Link>
                <Link
                  href={`/admin/prompts?datasetId=${dataset.id}`}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-500 hover:text-slate-900"
                >
                  View prompts
                </Link>
                <a
                  href={`/api/export?datasetId=${dataset.id}`}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Export XLSX
                </a>
                <form action={deleteDatasetAction}>
                  <input type="hidden" name="returnTo" value="/admin/datasets" />
                  <input type="hidden" name="datasetId" value={dataset.id} />
                  <ConfirmPendingButton
                    pendingLabel="Deleting dataset..."
                    confirmMessage={`Permanently delete dataset "${dataset.name}" and all of its prompts, assignments, reviews, intent checks, spot checks, and history? This cannot be undone.`}
                  >
                    Delete dataset
                  </ConfirmPendingButton>
                </form>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Deleting a dataset permanently removes every prompt and annotation linked to it.
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

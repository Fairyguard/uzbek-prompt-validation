import { updateDatasetSettingsAction } from "@/app/actions";
import { NoticeBanner } from "@/components/notice-banner";
import { PendingButton } from "@/components/pending-button";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { resolveReviewQuestions } from "@/lib/constants";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const datasets = await prisma.dataset.findMany({
    include: {
      settings: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const datasetId =
    (typeof params.datasetId === "string" ? params.datasetId : undefined) ?? datasets[0]?.id;
  const selected = datasets.find((dataset) => dataset.id === datasetId) ?? datasets[0];
  const reviewQuestions = selected?.settings
    ? resolveReviewQuestions(
        selected.settings.reviewQuestions,
        selected.settings.extraSafetyFactors,
      )
    : [];

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Settings</p>
        <h1 className="text-4xl text-slate-900">Dataset workflow settings</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600">
          Control review confirmation, intent checking, spot checking, and the checklist shown to
          reviewers for each dataset.
        </p>
      </div>

      <NoticeBanner
        notice={typeof params.notice === "string" ? params.notice : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <form className="flex flex-wrap gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="space-y-2 text-sm font-medium text-slate-700">
          Dataset
          <select
            name="datasetId"
            defaultValue={selected?.id}
            className="block min-w-56 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
          >
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
          Load
        </button>
      </form>

      {selected?.settings ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl text-slate-900">{selected.name}</h2>
          <form action={updateDatasetSettingsAction} className="mt-6 space-y-6">
            <input type="hidden" name="datasetId" value={selected.id} />
            <input type="hidden" name="returnTo" value={`/admin/settings?datasetId=${selected.id}`} />

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Successful reviews required
                <input
                  name="requiredReviews"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={selected.settings.requiredReviews}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Intent checks required
                <input
                  name="requiredIntentChecks"
                  type="number"
                  min={0}
                  max={10}
                  defaultValue={selected.settings.requiredIntentChecks}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                Random spot check %
                <input
                  name="randomSpotCheckPercentage"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={selected.settings.randomSpotCheckPercentage}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                <input
                  name="intentCheckEnabled"
                  type="checkbox"
                  defaultChecked={selected.settings.intentCheckEnabled}
                />
                Enable intent checks for this dataset
              </label>
              <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                <input
                  name="spotCheckEnabled"
                  type="checkbox"
                  defaultChecked={selected.settings.spotCheckEnabled}
                />
                Enable automatic spot checks for this dataset
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                <input
                  name="lowConfidenceTriggersSpotCheck"
                  type="checkbox"
                  defaultChecked={selected.settings.lowConfidenceTriggersSpotCheck}
                />
                Low-confidence intent results trigger spot check
              </label>
              <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700">
                <input
                  name="mismatchTriggersSpotCheck"
                  type="checkbox"
                  defaultChecked={selected.settings.mismatchTriggersSpotCheck}
                />
                Intent mismatch or manual-check-needed triggers spot check
              </label>
            </div>

            <label className="block space-y-2 text-sm font-medium text-slate-700">
              Review instructions
              <textarea
                name="reviewInstructions"
                rows={6}
                defaultValue={selected.settings.reviewInstructions}
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-900"
              />
            </label>

            <label className="block space-y-2 text-sm font-medium text-slate-700">
              Review checklist
              <textarea
                name="reviewQuestions"
                rows={10}
                defaultValue={reviewQuestions.map((question) => question.label).join("\n")}
                className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-900"
              />
              <p className="text-xs leading-5 text-slate-500">
                Enter one question per line. These questions unlock after the reviewer chooses
                Keep prompt or Edit prompt.
              </p>
            </label>

            <div className="flex justify-end">
              <PendingButton>Save settings</PendingButton>
            </div>
          </form>
        </section>
      ) : (
        <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8 text-sm text-slate-600">
          Import a dataset first to configure settings.
        </div>
      )}
    </div>
  );
}

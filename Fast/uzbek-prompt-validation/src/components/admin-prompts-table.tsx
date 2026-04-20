"use client";

import Link from "next/link";
import { useState } from "react";
import { PromptStatus } from "@prisma/client";
import { bulkDeletePromptsAction } from "@/app/actions";
import { ConfirmPendingButton } from "@/components/confirm-pending-button";
import { StatusBadge } from "@/components/status-badge";

type AdminPromptRow = {
  id: string;
  promptId: string;
  category: string;
  status: PromptStatus;
  reviewProgress: string;
  intentProgress: string;
  latestReviewerSummary: string;
  latestIntentSummary: string;
  spotCheckResult: string;
  finalStatus: string;
  updatedAtLabel: string;
  detailHref: string;
};

export function AdminPromptsTable({
  prompts,
  returnTo,
}: {
  prompts: AdminPromptRow[];
  returnTo: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visibleIds = prompts.map((prompt) => prompt.id);
  const visibleIdSet = new Set(visibleIds);
  const visibleSelectedIds = selectedIds.filter((id) => visibleIdSet.has(id));
  const selectedSet = new Set(visibleSelectedIds);
  const allVisibleSelected = prompts.length > 0 && prompts.every((prompt) => selectedSet.has(prompt.id));

  function togglePrompt(promptId: string) {
    setSelectedIds((current) =>
      current.includes(promptId) ? current.filter((id) => id !== promptId) : [...current, promptId],
    );
  }

  function toggleAll() {
    setSelectedIds(allVisibleSelected ? [] : visibleIds);
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <form action={bulkDeletePromptsAction} className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        {visibleSelectedIds.map((promptId) => (
          <input key={promptId} type="hidden" name="promptIds" value={promptId} />
        ))}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">
              Delete selected prompts
              <span className="ml-2 rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600">
                {visibleSelectedIds.length} selected
              </span>
            </p>
            <p className="text-sm text-slate-600">
              Deletion is permanent and removes the selected prompts together with their assignments,
              reviews, intent checks, spot checks, and prompt history.
            </p>
          </div>
          <ConfirmPendingButton
            disabled={visibleSelectedIds.length === 0}
            pendingLabel="Deleting prompts..."
            confirmMessage={`Permanently delete ${visibleSelectedIds.length} selected prompt${
              visibleSelectedIds.length === 1 ? "" : "s"
            }? This cannot be undone.`}
          >
            Delete selected
          </ConfirmPendingButton>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.18em] text-slate-500">
            <tr>
              <th className="px-5 py-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all visible prompts"
                  />
                  <span>Select</span>
                </label>
              </th>
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
            {prompts.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-8 text-center text-sm text-slate-500">
                  No prompts matched the current filters.
                </td>
              </tr>
            ) : (
              prompts.map((prompt) => (
                <tr key={prompt.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(prompt.id)}
                      onChange={() => togglePrompt(prompt.id)}
                      aria-label={`Select prompt ${prompt.promptId}`}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <Link href={prompt.detailHref} className="font-semibold text-slate-900 underline-offset-4 hover:underline">
                      {prompt.promptId}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-600">{prompt.category}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={prompt.status} />
                  </td>
                  <td className="px-5 py-4 text-slate-600">{prompt.reviewProgress}</td>
                  <td className="px-5 py-4 text-slate-600">{prompt.intentProgress}</td>
                  <td className="px-5 py-4 text-slate-600">{prompt.latestReviewerSummary}</td>
                  <td className="px-5 py-4 text-slate-600">{prompt.latestIntentSummary}</td>
                  <td className="px-5 py-4 text-slate-600">{prompt.spotCheckResult}</td>
                  <td className="px-5 py-4 text-slate-600">{prompt.finalStatus}</td>
                  <td className="px-5 py-4 text-slate-500">{prompt.updatedAtLabel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

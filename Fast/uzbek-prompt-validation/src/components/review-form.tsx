"use client";

import { useEffect, useMemo, useState } from "react";
import { ReviewTranslationChoice } from "@prisma/client";
import {
  EXTRA_FACTOR_OPTIONS,
  ExtraFactorDefinition,
  REVIEW_CATEGORY_OPTIONS,
  REVIEW_CLARITY_OPTIONS,
  REVIEW_DECISION_OPTIONS,
  REVIEW_DRIFT_OPTIONS,
  REVIEW_INTENT_OPTIONS,
  REVIEW_NATURALNESS_OPTIONS,
  REVIEW_STRENGTH_OPTIONS,
  REVIEW_TRANSLATION_CHOICE_OPTIONS,
} from "@/lib/constants";
import { PendingButton } from "@/components/pending-button";

type ReviewFormProps = {
  assignmentId: string;
  initialUzbekPrompt: string;
  extraFactors: ExtraFactorDefinition[];
  action: (formData: FormData) => void;
};

type DraftState = Record<string, string>;

export function ReviewForm({
  assignmentId,
  initialUzbekPrompt,
  extraFactors,
  action,
}: ReviewFormProps) {
  const storageKey = useMemo(() => `review-draft:${assignmentId}`, [assignmentId]);
  const [draft, setDraft] = useState<DraftState>(() => {
    const initialDraft = {
      translationChoice: "",
      editedUzbekPrompt: initialUzbekPrompt,
      notes: "",
    };

    if (typeof window === "undefined") {
      return initialDraft;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return initialDraft;
    }

    try {
      return {
        ...initialDraft,
        ...(JSON.parse(raw) as DraftState),
      };
    } catch {
      window.localStorage.removeItem(storageKey);
      return initialDraft;
    }
  });
  const isEditing = draft.translationChoice === ReviewTranslationChoice.EDIT_TRANSLATION;
  const isKeepingMt = draft.translationChoice === ReviewTranslationChoice.KEEP_MT;

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="assignmentId" value={assignmentId} />

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">Reviewed Uzbek text</p>
          <p className="text-sm leading-6 text-slate-600">
            Choose whether to keep the MT Uzbek prompt as-is or submit an edited Uzbek version.
          </p>
        </div>

        <div className="grid gap-3">
          {REVIEW_TRANSLATION_CHOICE_OPTIONS.map((option) => {
            const checked = draft.translationChoice === option.value;

            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-3xl border px-4 py-4 transition ${
                  checked
                    ? "border-slate-900 bg-white shadow-sm"
                    : "border-slate-200 bg-white/70 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="translationChoice"
                  value={option.value}
                  required
                  checked={checked}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      translationChoice: event.target.value,
                    }))
                  }
                  className="sr-only"
                />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{option.description}</p>
                  </div>
                  <span
                    className={`mt-0.5 h-4 w-4 rounded-full border ${
                      checked ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
                    }`}
                  />
                </div>
              </label>
            );
          })}
        </div>

        {isKeepingMt ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Final Uzbek text</p>
            <p className="whitespace-pre-wrap rounded-3xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700">
              {initialUzbekPrompt}
            </p>
          </div>
        ) : null}

        {isEditing ? (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="editedUzbekPrompt">
              Edited Uzbek translation
            </label>
            <textarea
              id="editedUzbekPrompt"
              name="editedUzbekPrompt"
              required={isEditing}
              rows={7}
              value={draft.editedUzbekPrompt ?? ""}
              onChange={(event) =>
                setDraft((current) => ({ ...current, editedUzbekPrompt: event.target.value }))
              }
              className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-900"
            />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          label="Intent matches original"
          name="intentMatchesOriginal"
          options={REVIEW_INTENT_OPTIONS}
          value={draft.intentMatchesOriginal ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, intentMatchesOriginal: value }))}
        />
        <SelectField
          label="Harm/category matches"
          name="harmCategoryMatches"
          options={REVIEW_CATEGORY_OPTIONS}
          value={draft.harmCategoryMatches ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, harmCategoryMatches: value }))}
        />
        <SelectField
          label="Strength of request"
          name="strengthOfRequest"
          options={REVIEW_STRENGTH_OPTIONS}
          value={draft.strengthOfRequest ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, strengthOfRequest: value }))}
        />
        <SelectField
          label="Meaning clarity in Uzbek"
          name="meaningClarity"
          options={REVIEW_CLARITY_OPTIONS}
          value={draft.meaningClarity ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, meaningClarity: value }))}
        />
        <SelectField
          label="Naturalness"
          name="naturalness"
          options={REVIEW_NATURALNESS_OPTIONS}
          value={draft.naturalness ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, naturalness: value }))}
        />
        <SelectField
          label="Meaning drift"
          name="meaningDrift"
          options={REVIEW_DRIFT_OPTIONS}
          value={draft.meaningDrift ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, meaningDrift: value }))}
        />
      </div>

      {extraFactors.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Extra Safety Factors
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {extraFactors.map((factor) => (
              <SelectField
                key={factor.key}
                label={factor.label}
                name={`extraFactor:${factor.key}`}
                options={EXTRA_FACTOR_OPTIONS}
                value={draft[`extraFactor:${factor.key}`] ?? ""}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    [`extraFactor:${factor.key}`]: value,
                  }))
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={draft.notes ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            className="w-full rounded-3xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-slate-900"
          />
        </div>
        <SelectField
          label="Final reviewer decision"
          name="finalDecision"
          options={REVIEW_DECISION_OPTIONS}
          value={draft.finalDecision ?? ""}
          onChange={(value) => setDraft((current) => ({ ...current, finalDecision: value }))}
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">
          Translation choice, draft text, and rubric answers autosave locally for this assignment.
        </p>
        <PendingButton>Submit review</PendingButton>
      </div>
    </form>
  );
}

function SelectField({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-slate-700" htmlFor={name}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-900"
      >
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

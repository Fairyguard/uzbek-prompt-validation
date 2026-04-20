"use client";

import { useEffect, useMemo, useState } from "react";
import { ReviewTranslationChoice } from "@prisma/client";
import {
  ExtraFactorDefinition,
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

const YES_NO_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

const CORE_REVIEW_QUESTIONS = [
  {
    key: "intentPreserved",
    label: "Does the Uzbek preserve the original intent?",
  },
  {
    key: "strengthPreserved",
    label: "Does it keep the same strength of request?",
  },
  {
    key: "harmCategoryPreserved",
    label: "Does it stay in the same harm category?",
  },
  {
    key: "naturalnessConfirmed",
    label: "Does the Uzbek sound natural?",
  },
  {
    key: "meaningClarityConfirmed",
    label: "Is the Uzbek wording clear?",
  },
  {
    key: "meaningPreserved",
    label: "Is the meaning preserved without drift?",
  },
] as const;

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
  const isKeepingPrompt = draft.translationChoice === ReviewTranslationChoice.KEEP_MT;
  const isNotSure = draft.translationChoice === ReviewTranslationChoice.NOT_SURE;
  const requiresChecks = isEditing || isKeepingPrompt;

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="assignmentId" value={assignmentId} />

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">How should this prompt move forward?</p>
          <p className="text-sm leading-6 text-slate-600">
            Choose whether to keep the current Uzbek prompt, edit it, or mark the case as not sure.
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

        {isKeepingPrompt || isNotSure ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              {isNotSure ? "Current Uzbek prompt" : "Prompt moving forward"}
            </p>
            <p className="whitespace-pre-wrap rounded-3xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700">
              {initialUzbekPrompt}
            </p>
          </div>
        ) : null}

        {isEditing ? (
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700" htmlFor="editedUzbekPrompt">
              Edited Uzbek prompt
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

      <div
        className={`space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition ${
          requiresChecks ? "" : "opacity-45"
        }`}
      >
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">Quick yes/no checks</h2>
          <p className="text-sm leading-6 text-slate-600">
            Answer each question after choosing <span className="font-medium">Keep prompt</span> or{" "}
            <span className="font-medium">Edit prompt</span>.
          </p>
        </div>

        <div className="space-y-3">
          {CORE_REVIEW_QUESTIONS.map((question) => (
            <BinaryQuestionRow
              key={question.key}
              label={question.label}
              name={question.key}
              value={draft[question.key] ?? ""}
              disabled={!requiresChecks}
              onChange={(value) => setDraft((current) => ({ ...current, [question.key]: value }))}
            />
          ))}

          {extraFactors.map((factor) => (
            <BinaryQuestionRow
              key={factor.key}
              label={formatExtraFactorQuestion(factor.label)}
              name={`extraFactor:${factor.key}`}
              value={draft[`extraFactor:${factor.key}`] ?? ""}
              disabled={!requiresChecks}
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

      <div className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">
          Your selection and current answers autosave locally for this prompt.
        </p>
        <PendingButton>Submit / Next</PendingButton>
      </div>
    </form>
  );
}

function BinaryQuestionRow({
  label,
  name,
  value,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 md:flex-row md:items-center md:justify-between ${
        disabled ? "pointer-events-none" : ""
      }`}
    >
      <p className="max-w-2xl text-sm font-medium leading-6 text-slate-900">{label}</p>
      <div className="flex gap-2">
        {YES_NO_OPTIONS.map((option) => {
          const checked = value === option.value;

          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition ${
                disabled
                  ? "border-slate-200 bg-slate-100 text-slate-400"
                  : checked
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                required={!disabled}
                disabled={disabled}
                onChange={(event) => onChange(event.target.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function formatExtraFactorQuestion(label: string) {
  if (/choice of language/i.test(label)) {
    return "Is the choice of language preserved?";
  }

  if (/safety-sensitive wording changes/i.test(label)) {
    return "Is the safety-sensitive wording handled correctly?";
  }

  const cleaned = label
    .replace(/\bpreservation\b/gi, "")
    .replace(/\bshift\b/gi, "")
    .trim()
    .toLowerCase();

  return `Is ${cleaned} preserved?`;
}

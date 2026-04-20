import {
  AssignmentStatus,
  PromptStatus,
  ReviewDecision,
  ReviewHarmCategoryMatch,
  ReviewIntentMatch,
  ReviewMeaningClarity,
  ReviewMeaningDrift,
  ReviewNaturalness,
  ReviewStrengthOfRequest,
  ReviewTranslationChoice,
  RoleName,
  SpotCheckAction,
  TaskType,
  IntentConfidence,
  IntentMatchStatus,
} from "@prisma/client";
import { safeJsonParse, slugifyLabel } from "@/lib/utils";

export type ReviewQuestionDefinition = {
  key: string;
  label: string;
};

export type ReviewQuestionAnswerMap = Record<string, string>;

export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: "Admin",
  REVIEWER: "Reviewer",
  INTENT_CHECKER: "Intent checker",
  SPOT_CHECKER: "Spot checker",
};

export const TASK_ROLE_MAP: Record<TaskType, RoleName> = {
  REVIEW: RoleName.REVIEWER,
  INTENT_CHECK: RoleName.INTENT_CHECKER,
  SPOT_CHECK: RoleName.SPOT_CHECKER,
};

export const ACTIVE_ASSIGNMENT_STATUSES = [
  AssignmentStatus.ASSIGNED,
  AssignmentStatus.IN_PROGRESS,
] as const;

export function isActiveAssignmentStatus(status: AssignmentStatus) {
  return ACTIVE_ASSIGNMENT_STATUSES.includes(
    status as (typeof ACTIVE_ASSIGNMENT_STATUSES)[number],
  );
}

export const STATUS_LABELS: Record<PromptStatus, string> = {
  PENDING_REVIEW: "Pending review",
  IN_REVIEW: "In review",
  REVIEWED: "Reviewed",
  PENDING_INTENT_CHECK: "Pending intent check",
  IN_INTENT_CHECK: "In intent check",
  INTENT_CHECKED: "Intent checked",
  PENDING_SPOT_CHECK: "Pending spot check",
  APPROVED: "Approved",
  NEEDS_REVISION: "Needs revision",
  REJECTED: "Rejected",
};

export const REVIEW_INTENT_OPTIONS = [
  { value: ReviewIntentMatch.FULLY_MATCHES, label: "Fully matches" },
  { value: ReviewIntentMatch.PARTLY_MATCHES, label: "Partly matches" },
  { value: ReviewIntentMatch.DOES_NOT_MATCH, label: "Does not match" },
  { value: ReviewIntentMatch.NOT_SURE, label: "Not sure" },
] as const;

export const REVIEW_CATEGORY_OPTIONS = [
  { value: ReviewHarmCategoryMatch.SAME_CATEGORY, label: "Same category" },
  { value: ReviewHarmCategoryMatch.DIFFERENT_CATEGORY, label: "Different category" },
  { value: ReviewHarmCategoryMatch.NOT_SURE, label: "Not sure" },
] as const;

export const REVIEW_STRENGTH_OPTIONS = [
  { value: ReviewStrengthOfRequest.SAME, label: "Same" },
  { value: ReviewStrengthOfRequest.SOFTER, label: "Softer" },
  { value: ReviewStrengthOfRequest.STRONGER, label: "Stronger" },
  { value: ReviewStrengthOfRequest.NOT_SURE, label: "Not sure" },
] as const;

export const REVIEW_CLARITY_OPTIONS = [
  { value: ReviewMeaningClarity.CLEAR, label: "Clear" },
  { value: ReviewMeaningClarity.SOMEWHAT_UNCLEAR, label: "Somewhat unclear" },
  { value: ReviewMeaningClarity.UNCLEAR, label: "Unclear" },
  { value: ReviewMeaningClarity.NOT_SURE, label: "Not sure" },
] as const;

export const REVIEW_NATURALNESS_OPTIONS = [
  { value: ReviewNaturalness.NATURAL, label: "Natural" },
  { value: ReviewNaturalness.ACCEPTABLE_BUT_AWKWARD, label: "Acceptable but awkward" },
  { value: ReviewNaturalness.UNNATURAL, label: "Unnatural" },
  { value: ReviewNaturalness.NOT_SURE, label: "Not sure" },
] as const;

export const REVIEW_DRIFT_OPTIONS = [
  { value: ReviewMeaningDrift.NONE, label: "None" },
  { value: ReviewMeaningDrift.POSSIBLE_DRIFT, label: "Possible drift" },
  { value: ReviewMeaningDrift.CLEAR_DRIFT, label: "Clear drift" },
  { value: ReviewMeaningDrift.NOT_SURE, label: "Not sure" },
] as const;

export const REVIEW_DECISION_OPTIONS = [
  { value: ReviewDecision.KEEP, label: "Keep" },
  { value: ReviewDecision.REVISE, label: "Revise" },
  { value: ReviewDecision.REJECT, label: "Reject" },
  { value: ReviewDecision.NEEDS_SECOND_REVIEW, label: "Not sure / Needs second review" },
] as const;

export const REVIEW_TRANSLATION_CHOICE_OPTIONS = [
  {
    value: ReviewTranslationChoice.KEEP_MT,
    label: "Keep prompt",
    description: "The current Uzbek prompt already works and can move forward as-is.",
  },
  {
    value: ReviewTranslationChoice.EDIT_TRANSLATION,
    label: "Edit prompt",
    description: "You want to revise the Uzbek prompt before it moves forward.",
  },
  {
    value: ReviewTranslationChoice.NOT_SURE,
    label: "Not sure",
    description: "You are uncertain and want the system to flag this prompt for follow-up.",
  },
] as const;

export const REVIEW_TRANSLATION_CHOICE_LABELS: Record<ReviewTranslationChoice, string> = {
  KEEP_MT: "Kept prompt",
  EDIT_TRANSLATION: "Edited prompt",
  NOT_SURE: "Not sure",
};

export const INTENT_CONFIDENCE_OPTIONS = [
  { value: IntentConfidence.HIGH, label: "High" },
  { value: IntentConfidence.MEDIUM, label: "Medium" },
  { value: IntentConfidence.LOW, label: "Low" },
] as const;

export const SPOT_CHECK_ACTION_OPTIONS = [
  { value: SpotCheckAction.APPROVE, label: "Approve" },
  { value: SpotCheckAction.SEND_BACK_FOR_REVISION, label: "Send back for revision" },
  { value: SpotCheckAction.REJECT, label: "Reject" },
  { value: SpotCheckAction.FLAG_MEANING_DRIFT, label: "Flag meaning drift" },
  { value: SpotCheckAction.FLAG_UNCLEAR_WORDING, label: "Flag unclear wording" },
  { value: SpotCheckAction.FLAG_UNREALISTIC_UZBEK, label: "Flag unrealistic Uzbek" },
] as const;

export const INTENT_MATCH_LABELS: Record<IntentMatchStatus, string> = {
  MATCH: "Match",
  PARTIAL_MATCH: "Partial match",
  MISMATCH: "Mismatch",
  MANUAL_CHECK_NEEDED: "Manual check needed",
};

export const EXTRA_FACTOR_OPTIONS = [
  { value: "preserved", label: "Preserved" },
  { value: "shifted", label: "Shifted" },
  { value: "safety_sensitive_change", label: "Safety-sensitive change" },
  { value: "not_sure", label: "Not sure" },
] as const;

export const DEFAULT_REVIEW_INSTRUCTIONS = `Review the MT Uzbek prompt for meaning preservation, safety-sensitive drift, naturalness, and research readiness. Use the rubric carefully and edit the Uzbek prompt only when it improves fidelity or clarity without changing intent.`;

export const DEFAULT_REVIEW_QUESTIONS: ReviewQuestionDefinition[] = [
  {
    key: "intent_preserved",
    label: "Does the Uzbek preserve the original intent?",
  },
  {
    key: "strength_preserved",
    label: "Does it keep the same strength of request?",
  },
  {
    key: "harm_category_preserved",
    label: "Does it stay in the same harm category?",
  },
  {
    key: "naturalness_confirmed",
    label: "Does the Uzbek sound natural?",
  },
  {
    key: "meaning_clarity_confirmed",
    label: "Is the Uzbek wording clear?",
  },
  {
    key: "meaning_preserved",
    label: "Is the meaning preserved without drift?",
  },
  {
    key: "tone_preservation",
    label: "Is tone preserved?",
  },
  {
    key: "aggressiveness_preservation",
    label: "Is aggressiveness preserved?",
  },
  {
    key: "safety_sensitive_wording_changes",
    label: "Is the safety-sensitive wording handled correctly?",
  },
  {
    key: "politeness_shift",
    label: "Is politeness preserved?",
  },
  {
    key: "choice_of_language",
    label: "Is the choice of language preserved?",
  },
  {
    key: "directness_shift",
    label: "Is directness preserved?",
  },
] as const;

export const DEFAULT_EXTRA_FACTOR_LABELS = [
  "Tone preservation",
  "Aggressiveness preservation",
  "Safety-sensitive wording changes",
  "Politeness shift",
  "Choice of language",
  "Directness shift",
];

export const REVIEWER_REQUIRED_EXTRA_FACTOR_LABELS = [
  "Tone preservation",
  "Aggressiveness preservation",
  "Politeness shift",
  "Choice of language",
  "Directness shift",
];

export function parseReviewQuestions(input: string | null | undefined) {
  const parsed = safeJsonParse<ReviewQuestionDefinition[]>(input ?? "[]", []);

  if (parsed.length === 0) {
    return DEFAULT_REVIEW_QUESTIONS;
  }

  return parsed
    .map((question) => ({
      key: slugifyLabel(question.key || question.label),
      label: question.label.trim(),
    }))
    .filter((question) => question.key && question.label);
}

export function parseReviewQuestionLines(input: string) {
  const labels = input
    .split(/\r?\n/)
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length === 0) {
    return DEFAULT_REVIEW_QUESTIONS;
  }

  return labels.map((label) => ({
    key: slugifyLabel(label),
    label,
  }));
}

export function getLegacyExtraFactors(extraFactors: ReviewQuestionDefinition[]) {
  const merged = new Map<string, ReviewQuestionDefinition>();

  for (const factor of extraFactors) {
    merged.set(factor.key, factor);
  }

  for (const label of REVIEWER_REQUIRED_EXTRA_FACTOR_LABELS) {
    const key = slugifyLabel(label);
    if (!merged.has(key)) {
      merged.set(key, { key, label });
    }
  }

  return [...merged.values()];
}

export function resolveReviewQuestions(
  reviewQuestions: string | null | undefined,
  legacyExtraSafetyFactors?: string | null,
) {
  const configuredQuestions = parseReviewQuestions(reviewQuestions);

  if (configuredQuestions.length > 0 && reviewQuestions) {
    return configuredQuestions;
  }

  const legacyFactors = safeJsonParse<ReviewQuestionDefinition[]>(
    legacyExtraSafetyFactors ?? "[]",
    [],
  )
    .map((factor) => ({
      key: slugifyLabel(factor.key || factor.label),
      label: factor.label.trim(),
    }))
    .filter((factor) => factor.key && factor.label);

  if (legacyFactors.length === 0) {
    return configuredQuestions;
  }

  return getLegacyExtraFactors(legacyFactors);
}

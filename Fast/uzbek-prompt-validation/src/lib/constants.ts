import {
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
import { slugifyLabel } from "@/lib/utils";

export type ExtraFactorDefinition = {
  key: string;
  label: string;
};

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

export function getReviewerExtraFactors(extraFactors: ExtraFactorDefinition[]) {
  const merged = new Map<string, ExtraFactorDefinition>();

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

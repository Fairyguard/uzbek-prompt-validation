import {
  FinalDecision,
  IntentConfidence,
  IntentMatchStatus,
  PromptStatus,
  ReviewDecision,
  ReviewMeaningClarity,
  ReviewMeaningDrift,
  ReviewNaturalness,
} from "@prisma/client";
import { deterministicPercentBucket, jaccardSimilarity, normalizeComparableText } from "@/lib/utils";

export type ReviewRecordLike = {
  id: string;
  editedUzbekPrompt: string;
  intentMatchesOriginal: string;
  harmCategoryMatches: string;
  strengthOfRequest: string;
  meaningClarity: ReviewMeaningClarity;
  naturalness: ReviewNaturalness;
  meaningDrift: ReviewMeaningDrift;
  finalDecision: ReviewDecision;
};

export type IntentCheckLike = {
  id: string;
  recoveredIntent: string;
  confidence: IntentConfidence;
  matchStatus?: IntentMatchStatus | null;
};

export type SettingsLike = {
  requiredReviews: number;
  requiredIntentChecks: number;
  randomSpotCheckPercentage: number;
  lowConfidenceTriggersSpotCheck: boolean;
  mismatchTriggersSpotCheck: boolean;
};

export type PromptWorkflowLike = {
  id: string;
  status: PromptStatus;
  requiredReviews: number;
  requiredIntentChecks: number;
  intendedIntent?: string | null;
  canonicalUzbekPrompt?: string | null;
  manualSpotCheckRequested: boolean;
  extraReviewRequested: boolean;
  randomSpotCheckSelected: boolean;
  finalDecision?: FinalDecision | null;
  completedReviewAssignments: number;
  openReviewAssignments: number;
  completedIntentAssignments: number;
  openIntentAssignments: number;
  spotChecks: Array<{ action: string }>;
};

export type ReviewSummary = {
  counts: Record<string, number>;
  reviewerDecisionCounts: Record<string, number>;
  disagreement: boolean;
  hasNotSure: boolean;
  hasReject: boolean;
  hasClearDrift: boolean;
  hasUnclear: boolean;
  hasUnnatural: boolean;
};

export type IntentSummary = {
  aggregateStatus: IntentMatchStatus | null;
  lowConfidence: boolean;
  disagreement: boolean;
  individualStatuses: IntentMatchStatus[];
};

export function buildReviewSummary(reviews: ReviewRecordLike[]): ReviewSummary {
  const counts: Record<string, number> = {};
  const reviewerDecisionCounts: Record<string, number> = {};

  let hasNotSure = false;
  let hasReject = false;
  let hasClearDrift = false;
  let hasUnclear = false;
  let hasUnnatural = false;

  for (const review of reviews) {
    reviewerDecisionCounts[review.finalDecision] = (reviewerDecisionCounts[review.finalDecision] ?? 0) + 1;

    [
      review.intentMatchesOriginal,
      review.harmCategoryMatches,
      review.strengthOfRequest,
      review.meaningClarity,
      review.naturalness,
      review.meaningDrift,
      review.finalDecision,
    ].forEach((value) => {
      counts[value] = (counts[value] ?? 0) + 1;
    });

    if (
      review.intentMatchesOriginal === "NOT_SURE" ||
      review.harmCategoryMatches === "NOT_SURE" ||
      review.strengthOfRequest === "NOT_SURE" ||
      review.meaningClarity === ReviewMeaningClarity.NOT_SURE ||
      review.naturalness === ReviewNaturalness.NOT_SURE ||
      review.meaningDrift === ReviewMeaningDrift.NOT_SURE ||
      review.finalDecision === ReviewDecision.NEEDS_SECOND_REVIEW
    ) {
      hasNotSure = true;
    }

    if (review.finalDecision === ReviewDecision.REJECT) {
      hasReject = true;
    }

    if (review.meaningDrift === ReviewMeaningDrift.CLEAR_DRIFT) {
      hasClearDrift = true;
    }

    if (review.meaningClarity === ReviewMeaningClarity.UNCLEAR) {
      hasUnclear = true;
    }

    if (review.naturalness === ReviewNaturalness.UNNATURAL) {
      hasUnnatural = true;
    }
  }

  const uniqueDecisions = Object.keys(reviewerDecisionCounts);

  return {
    counts,
    reviewerDecisionCounts,
    disagreement: uniqueDecisions.length > 1,
    hasNotSure,
    hasReject,
    hasClearDrift,
    hasUnclear,
    hasUnnatural,
  };
}

export function chooseCanonicalUzbek(
  reviews: ReviewRecordLike[],
  existingCanonical?: string | null,
) {
  if (reviews.length === 0) {
    return {
      canonicalUzbekPrompt: existingCanonical ?? null,
      needsCanonicalSelection: false,
      normalizedOptions: [] as string[],
      consensus: false,
    };
  }

  const normalizedMap = new Map<string, string>();

  for (const review of reviews) {
    const normalized = normalizeComparableText(review.editedUzbekPrompt);
    if (!normalizedMap.has(normalized)) {
      normalizedMap.set(normalized, review.editedUzbekPrompt.trim());
    }
  }

  if (normalizedMap.size === 1) {
    const canonical = normalizedMap.values().next().value as string;
    return {
      canonicalUzbekPrompt: canonical,
      needsCanonicalSelection: false,
      normalizedOptions: [...normalizedMap.keys()],
      consensus: true,
    };
  }

  return {
    canonicalUzbekPrompt: existingCanonical ?? null,
    needsCanonicalSelection: !existingCanonical,
    normalizedOptions: [...normalizedMap.keys()],
    consensus: false,
  };
}

export function compareIntentText(
  intendedIntent: string | null | undefined,
  recoveredIntent: string | null | undefined,
) {
  if (!intendedIntent || !recoveredIntent) {
    return IntentMatchStatus.MANUAL_CHECK_NEEDED;
  }

  const similarity = jaccardSimilarity(intendedIntent, recoveredIntent);

  if (similarity >= 0.72) {
    return IntentMatchStatus.MATCH;
  }

  if (similarity >= 0.38) {
    return IntentMatchStatus.PARTIAL_MATCH;
  }

  return IntentMatchStatus.MISMATCH;
}

export function buildIntentSummary(
  intendedIntent: string | null | undefined,
  intentChecks: IntentCheckLike[],
): IntentSummary {
  if (intentChecks.length === 0) {
    return {
      aggregateStatus: null,
      lowConfidence: false,
      disagreement: false,
      individualStatuses: [],
    };
  }

  const lowConfidence = intentChecks.some((check) => check.confidence === IntentConfidence.LOW);
  const individualStatuses = intentChecks.map((check) =>
    check.matchStatus ?? compareIntentText(intendedIntent, check.recoveredIntent),
  );
  const uniqueStatuses = [...new Set(individualStatuses)];

  let disagreement = uniqueStatuses.length > 1;

  if (!disagreement && intentChecks.length > 1) {
    const baseline = intentChecks[0]?.recoveredIntent ?? "";
    disagreement = intentChecks
      .slice(1)
      .some((check) => jaccardSimilarity(baseline, check.recoveredIntent) < 0.45);
  }

  let aggregateStatus: IntentMatchStatus | null = uniqueStatuses[0] ?? null;

  if (!intendedIntent || lowConfidence || disagreement) {
    aggregateStatus = IntentMatchStatus.MANUAL_CHECK_NEEDED;
  }

  return {
    aggregateStatus,
    lowConfidence,
    disagreement,
    individualStatuses,
  };
}

export function computeEscalationReasons(args: {
  prompt: Pick<PromptWorkflowLike, "id" | "manualSpotCheckRequested" | "randomSpotCheckSelected">;
  reviewSummary: ReviewSummary;
  intentSummary: IntentSummary;
  settings: SettingsLike;
}) {
  const reasons: string[] = [];

  if (args.reviewSummary.hasNotSure) {
    reasons.push("review_not_sure");
  }

  if (args.reviewSummary.hasReject) {
    reasons.push("review_reject");
  }

  if (args.reviewSummary.hasClearDrift) {
    reasons.push("review_clear_drift");
  }

  if (args.reviewSummary.hasUnclear) {
    reasons.push("review_unclear");
  }

  if (args.reviewSummary.hasUnnatural) {
    reasons.push("review_unnatural");
  }

  if (args.intentSummary.lowConfidence && args.settings.lowConfidenceTriggersSpotCheck) {
    reasons.push("low_intent_confidence");
  }

  if (
    args.settings.mismatchTriggersSpotCheck &&
    (args.intentSummary.aggregateStatus === IntentMatchStatus.MISMATCH ||
      args.intentSummary.aggregateStatus === IntentMatchStatus.MANUAL_CHECK_NEEDED)
  ) {
    reasons.push("intent_mismatch_or_manual_check");
  }

  if (args.prompt.manualSpotCheckRequested) {
    reasons.push("manual_admin_selection");
  }

  if (args.prompt.randomSpotCheckSelected) {
    reasons.push("random_sampling");
  }

  return reasons;
}

export function shouldSelectRandomSpotCheck(promptId: string, percentage: number) {
  if (percentage <= 0) {
    return false;
  }

  return deterministicPercentBucket(promptId) < percentage;
}

export function computeAutoFinalDecision(args: {
  reviewSummary: ReviewSummary;
  intentSummary: IntentSummary;
}) {
  const hasOnlyKeepDecisions =
    Object.keys(args.reviewSummary.reviewerDecisionCounts).length === 1 &&
    args.reviewSummary.reviewerDecisionCounts[ReviewDecision.KEEP] > 0;

  if (
    hasOnlyKeepDecisions &&
    args.intentSummary.aggregateStatus === IntentMatchStatus.MATCH &&
    !args.reviewSummary.hasNotSure &&
    !args.reviewSummary.hasClearDrift &&
    !args.reviewSummary.hasUnclear &&
    !args.reviewSummary.hasUnnatural
  ) {
    return FinalDecision.APPROVED;
  }

  return FinalDecision.NEEDS_REVISION;
}

export function computePromptState(args: {
  prompt: PromptWorkflowLike;
  settings: SettingsLike;
  reviewSummary: ReviewSummary;
  intentSummary: IntentSummary;
  canonicalDecision: ReturnType<typeof chooseCanonicalUzbek>;
}) {
  const requiredReviewTarget =
    args.prompt.requiredReviews + (args.prompt.extraReviewRequested ? 1 : 0);
  const reviewComplete = args.prompt.completedReviewAssignments >= requiredReviewTarget;
  const intentComplete =
    args.prompt.completedIntentAssignments >= args.prompt.requiredIntentChecks &&
    Boolean(args.canonicalDecision.canonicalUzbekPrompt);
  const randomSpotCheckSelected =
    args.prompt.randomSpotCheckSelected ||
    shouldSelectRandomSpotCheck(args.prompt.id, args.settings.randomSpotCheckPercentage);

  const escalationReasons = computeEscalationReasons({
    prompt: {
      id: args.prompt.id,
      manualSpotCheckRequested: args.prompt.manualSpotCheckRequested,
      randomSpotCheckSelected,
    },
    reviewSummary: args.reviewSummary,
    intentSummary: args.intentSummary,
    settings: args.settings,
  });

  if (args.prompt.finalDecision === FinalDecision.REJECTED) {
    return {
      status: PromptStatus.REJECTED,
      finalDecision: FinalDecision.REJECTED,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  if (args.prompt.finalDecision === FinalDecision.APPROVED) {
    return {
      status: PromptStatus.APPROVED,
      finalDecision: FinalDecision.APPROVED,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: false,
    };
  }

  if (args.prompt.finalDecision === FinalDecision.NEEDS_REVISION) {
    return {
      status: PromptStatus.NEEDS_REVISION,
      finalDecision: FinalDecision.NEEDS_REVISION,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  const latestSpotCheck = args.prompt.spotChecks.at(-1)?.action;
  if (latestSpotCheck === "APPROVE") {
    return {
      status: PromptStatus.APPROVED,
      finalDecision: FinalDecision.APPROVED,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  if (latestSpotCheck === "SEND_BACK_FOR_REVISION") {
    return {
      status: PromptStatus.NEEDS_REVISION,
      finalDecision: FinalDecision.NEEDS_REVISION,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  if (latestSpotCheck === "REJECT") {
    return {
      status: PromptStatus.REJECTED,
      finalDecision: FinalDecision.REJECTED,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  if (
    latestSpotCheck === "FLAG_MEANING_DRIFT" ||
    latestSpotCheck === "FLAG_UNCLEAR_WORDING" ||
    latestSpotCheck === "FLAG_UNREALISTIC_UZBEK"
  ) {
    return {
      status: PromptStatus.NEEDS_REVISION,
      finalDecision: FinalDecision.NEEDS_REVISION,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  if (!reviewComplete) {
    return {
      status:
        args.prompt.openReviewAssignments > 0 || args.prompt.completedReviewAssignments > 0
          ? PromptStatus.IN_REVIEW
          : PromptStatus.PENDING_REVIEW,
      finalDecision: null,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: false,
    };
  }

  if (args.canonicalDecision.needsCanonicalSelection) {
    return {
      status: PromptStatus.REVIEWED,
      finalDecision: null,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: false,
    };
  }

  if (!intentComplete) {
    return {
      status:
        args.prompt.openIntentAssignments > 0 || args.prompt.completedIntentAssignments > 0
          ? PromptStatus.IN_INTENT_CHECK
          : PromptStatus.PENDING_INTENT_CHECK,
      finalDecision: null,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: false,
    };
  }

  if (escalationReasons.length > 0) {
    return {
      status: PromptStatus.PENDING_SPOT_CHECK,
      finalDecision: null,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  const autoFinalDecision = computeAutoFinalDecision({
    reviewSummary: args.reviewSummary,
    intentSummary: args.intentSummary,
  });

  return {
    status:
      autoFinalDecision === FinalDecision.APPROVED
        ? PromptStatus.APPROVED
        : PromptStatus.NEEDS_REVISION,
    finalDecision: autoFinalDecision,
    escalationReasons,
    randomSpotCheckSelected,
    spotCheckRequired: false,
  };
}

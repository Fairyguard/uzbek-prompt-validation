import {
  FinalDecision,
  IntentConfidence,
  IntentMatchStatus,
  PromptStatus,
  ReviewDecision,
  ReviewMeaningClarity,
  ReviewMeaningDrift,
  ReviewNaturalness,
  ReviewTranslationChoice,
} from "@prisma/client";
import {
  deterministicPercentBucket,
  jaccardSimilarity,
  normalizeComparableText,
} from "@/lib/utils";

export type ReviewRecordLike = {
  id: string;
  reviewerId?: string | null;
  createdAt?: Date | string;
  translationChoice: ReviewTranslationChoice;
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
  intentCheckEnabled: boolean;
  requiredIntentChecks: number;
  spotCheckEnabled: boolean;
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
  successfulReviewCount: number;
  successfulKeepCount: number;
  successfulEditCount: number;
  latestSuccessfulChoice: ReviewTranslationChoice | null;
  latestSuccessfulText: string | null;
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

export type ReviewSupportState = {
  currentReviewPrompt: string;
  canonicalUzbekPrompt: string | null;
  reviewTargetReached: boolean;
  confirmedReviewerCount: number;
  confirmedKeepCount: number;
  requiresKeepOnlyConfirmation: boolean;
  needsCanonicalSelection: boolean;
  normalizedOptions: string[];
  consensus: boolean;
};

function isFollowUpReview(review: ReviewRecordLike) {
  return (
    review.translationChoice === ReviewTranslationChoice.NOT_SURE ||
    review.finalDecision === ReviewDecision.NEEDS_SECOND_REVIEW ||
    review.finalDecision === ReviewDecision.REJECT
  );
}

function isDecisiveReview(review: ReviewRecordLike) {
  return !isFollowUpReview(review);
}

function evaluateReviewSupport(args: {
  reviews: ReviewRecordLike[];
  fallbackPrompt: string;
  existingCanonical?: string | null;
  requiredReviewTarget?: number;
}): ReviewSupportState {
  const requiredReviewTarget = Math.max(args.requiredReviewTarget ?? 2, 1);
  let currentReviewPrompt =
    args.existingCanonical?.trim() || args.fallbackPrompt.trim();
  let currentPromptKey = normalizeComparableText(currentReviewPrompt);
  let confirmedReviewerIds = new Set<string>();
  let confirmedKeepReviewerIds = new Set<string>();
  let requiresKeepOnlyConfirmation = false;

  for (const review of args.reviews) {
    const nextPrompt = review.editedUzbekPrompt.trim() || currentReviewPrompt;
    const nextPromptKey = normalizeComparableText(nextPrompt);

    if (isFollowUpReview(review)) {
      currentReviewPrompt = nextPrompt;
      currentPromptKey = nextPromptKey;
      confirmedReviewerIds.clear();
      confirmedKeepReviewerIds.clear();
      requiresKeepOnlyConfirmation = true;
      continue;
    }

    if (review.translationChoice === ReviewTranslationChoice.EDIT_TRANSLATION) {
      currentReviewPrompt = nextPrompt;
      currentPromptKey = nextPromptKey;
      confirmedReviewerIds = requiresKeepOnlyConfirmation
        ? new Set<string>()
        : new Set(review.reviewerId ? [review.reviewerId] : []);
      confirmedKeepReviewerIds = new Set<string>();
      continue;
    }

    if (nextPromptKey !== currentPromptKey) {
      currentReviewPrompt = nextPrompt;
      currentPromptKey = nextPromptKey;
      confirmedReviewerIds.clear();
      confirmedKeepReviewerIds.clear();
    }

    currentReviewPrompt = nextPrompt;
    currentPromptKey = nextPromptKey;

    if (review.reviewerId) {
      confirmedReviewerIds.add(review.reviewerId);
      confirmedKeepReviewerIds.add(review.reviewerId);
    }
  }

  const confirmedReviewerCount = requiresKeepOnlyConfirmation
    ? confirmedKeepReviewerIds.size
    : confirmedReviewerIds.size;
  const confirmedKeepCount = confirmedKeepReviewerIds.size;
  const reviewTargetReached =
    confirmedReviewerCount >= requiredReviewTarget &&
    confirmedKeepCount >= 1;

  return {
    currentReviewPrompt,
    canonicalUzbekPrompt: reviewTargetReached ? currentReviewPrompt : null,
    reviewTargetReached,
    confirmedReviewerCount,
    confirmedKeepCount,
    requiresKeepOnlyConfirmation,
    needsCanonicalSelection: false,
    normalizedOptions: currentPromptKey ? [currentPromptKey] : [],
    consensus: reviewTargetReached,
  };
}

export function buildReviewSummary(reviews: ReviewRecordLike[]): ReviewSummary {
  const counts: Record<string, number> = {};
  const reviewerDecisionCounts: Record<string, number> = {};
  const decisiveTexts = new Set<string>();

  let hasNotSure = false;
  let hasReject = false;
  let hasClearDrift = false;
  let hasUnclear = false;
  let hasUnnatural = false;
  let successfulReviewCount = 0;
  let successfulKeepCount = 0;
  let successfulEditCount = 0;
  let latestSuccessfulChoice: ReviewTranslationChoice | null = null;
  let latestSuccessfulText: string | null = null;

  for (const review of reviews) {
    counts[review.translationChoice] = (counts[review.translationChoice] ?? 0) + 1;
    reviewerDecisionCounts[review.finalDecision] =
      (reviewerDecisionCounts[review.finalDecision] ?? 0) + 1;

    [
      review.intentMatchesOriginal,
      review.harmCategoryMatches,
      review.strengthOfRequest,
      review.meaningClarity,
      review.naturalness,
      review.meaningDrift,
      review.finalDecision,
      review.translationChoice,
    ].forEach((value) => {
      counts[value] = (counts[value] ?? 0) + 1;
    });

    if (
      review.translationChoice === ReviewTranslationChoice.NOT_SURE ||
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

    if (!isDecisiveReview(review)) {
      continue;
    }

    successfulReviewCount += 1;
    latestSuccessfulChoice = review.translationChoice;
    latestSuccessfulText = review.editedUzbekPrompt.trim();
    decisiveTexts.add(normalizeComparableText(review.editedUzbekPrompt));

    if (review.translationChoice === ReviewTranslationChoice.KEEP_MT) {
      successfulKeepCount += 1;
    }

    if (review.translationChoice === ReviewTranslationChoice.EDIT_TRANSLATION) {
      successfulEditCount += 1;
    }
  }

  return {
    counts,
    reviewerDecisionCounts,
    successfulReviewCount,
    successfulKeepCount,
    successfulEditCount,
    latestSuccessfulChoice,
    latestSuccessfulText,
    disagreement: decisiveTexts.size > 1 || hasReject,
    hasNotSure,
    hasReject,
    hasClearDrift,
    hasUnclear,
    hasUnnatural,
  };
}

export function chooseCanonicalUzbek(
  reviews: ReviewRecordLike[],
  baseUzbekPrompt: string,
  existingCanonical?: string | null,
  requiredReviewTarget = 2,
) {
  return evaluateReviewSupport({
    reviews,
    fallbackPrompt: baseUzbekPrompt,
    existingCanonical,
    requiredReviewTarget,
  });
}

export function getCurrentReviewPrompt(
  reviews: ReviewRecordLike[],
  fallbackPrompt: string,
  existingCanonical?: string | null,
) {
  return evaluateReviewSupport({
    reviews,
    fallbackPrompt,
    existingCanonical,
    requiredReviewTarget: Number.MAX_SAFE_INTEGER,
  }).currentReviewPrompt;
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
  intentSummary: IntentSummary;
  settings: SettingsLike;
}) {
  const reasons: string[] = [];

  if (
    args.settings.spotCheckEnabled &&
    args.settings.intentCheckEnabled &&
    args.intentSummary.lowConfidence &&
    args.settings.lowConfidenceTriggersSpotCheck
  ) {
    reasons.push("low_intent_confidence");
  }

  if (
    args.settings.spotCheckEnabled &&
    args.settings.intentCheckEnabled &&
    args.settings.mismatchTriggersSpotCheck &&
    (args.intentSummary.aggregateStatus === IntentMatchStatus.MISMATCH ||
      args.intentSummary.aggregateStatus === IntentMatchStatus.MANUAL_CHECK_NEEDED)
  ) {
    reasons.push("intent_mismatch_or_manual_check");
  }

  if (args.settings.spotCheckEnabled && args.prompt.manualSpotCheckRequested) {
    reasons.push("manual_admin_selection");
  }

  if (args.settings.spotCheckEnabled && args.prompt.randomSpotCheckSelected) {
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
  intentEnabled: boolean;
  intentSummary: IntentSummary;
}) {
  if (!args.intentEnabled) {
    return FinalDecision.APPROVED;
  }

  return args.intentSummary.aggregateStatus === IntentMatchStatus.MATCH
    ? FinalDecision.APPROVED
    : FinalDecision.NEEDS_REVISION;
}

export function computePromptState(args: {
  prompt: PromptWorkflowLike;
  settings: SettingsLike;
  reviewSummary: ReviewSummary;
  intentSummary: IntentSummary;
  canonicalDecision: ReturnType<typeof chooseCanonicalUzbek>;
}) {
  const intentEnabled =
    args.settings.intentCheckEnabled && args.prompt.requiredIntentChecks > 0;
  const reviewComplete = args.canonicalDecision.reviewTargetReached;
  const intentComplete =
    !intentEnabled ||
    (args.prompt.completedIntentAssignments >= args.prompt.requiredIntentChecks &&
      Boolean(args.canonicalDecision.canonicalUzbekPrompt));
  const randomSpotCheckSelected =
    args.settings.spotCheckEnabled &&
    (args.prompt.randomSpotCheckSelected ||
      shouldSelectRandomSpotCheck(args.prompt.id, args.settings.randomSpotCheckPercentage));

  const escalationReasons = computeEscalationReasons({
    prompt: {
      id: args.prompt.id,
      manualSpotCheckRequested: args.prompt.manualSpotCheckRequested,
      randomSpotCheckSelected,
    },
    intentSummary: args.intentSummary,
    settings: args.settings,
  });

  if (args.prompt.finalDecision === FinalDecision.REJECTED) {
    return {
      status: PromptStatus.REJECTED,
      finalDecision: FinalDecision.REJECTED,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: args.settings.spotCheckEnabled,
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
      spotCheckRequired: args.settings.spotCheckEnabled,
    };
  }

  const latestSpotCheck = args.prompt.spotChecks.at(-1)?.action;
  if (latestSpotCheck === "APPROVE") {
    return {
      status: PromptStatus.APPROVED,
      finalDecision: FinalDecision.APPROVED,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: args.settings.spotCheckEnabled,
    };
  }

  if (
    latestSpotCheck === "SEND_BACK_FOR_REVISION" ||
    latestSpotCheck === "FLAG_MEANING_DRIFT" ||
    latestSpotCheck === "FLAG_UNCLEAR_WORDING" ||
    latestSpotCheck === "FLAG_UNREALISTIC_UZBEK"
  ) {
    return {
      status: PromptStatus.NEEDS_REVISION,
      finalDecision: FinalDecision.NEEDS_REVISION,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: args.settings.spotCheckEnabled,
    };
  }

  if (latestSpotCheck === "REJECT") {
    return {
      status: PromptStatus.REJECTED,
      finalDecision: FinalDecision.REJECTED,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: args.settings.spotCheckEnabled,
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

  if (intentEnabled && !intentComplete) {
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

  if (args.settings.spotCheckEnabled && escalationReasons.length > 0) {
    return {
      status: PromptStatus.PENDING_SPOT_CHECK,
      finalDecision: null,
      escalationReasons,
      randomSpotCheckSelected,
      spotCheckRequired: true,
    };
  }

  const autoFinalDecision = computeAutoFinalDecision({
    intentEnabled,
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

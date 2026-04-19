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
import {
  buildIntentSummary,
  buildReviewSummary,
  chooseCanonicalUzbek,
  compareIntentText,
  computePromptState,
} from "@/lib/workflow-rules";

describe("workflow rules", () => {
  it("preserves consensus when one reviewer keeps the MT text explicitly", () => {
    const result = chooseCanonicalUzbek([
      {
        id: "1",
        editedUzbekPrompt: "Xavfsiz matn",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.NONE,
        finalDecision: ReviewDecision.KEEP,
      },
      {
        id: "2",
        editedUzbekPrompt: "xavfsiz   matn",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.NONE,
        finalDecision: ReviewDecision.KEEP,
      },
    ]);

    expect(result.consensus).toBe(true);
    expect(result.canonicalUzbekPrompt).toBeTruthy();
  });

  it("detects canonical consensus after whitespace normalization", () => {
    const result = chooseCanonicalUzbek([
      {
        id: "1",
        editedUzbekPrompt: "Salom   dunyo",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.NONE,
        finalDecision: ReviewDecision.KEEP,
      },
      {
        id: "2",
        editedUzbekPrompt: "salom dunyo",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.NONE,
        finalDecision: ReviewDecision.KEEP,
      },
    ]);

    expect(result.consensus).toBe(true);
    expect(result.needsCanonicalSelection).toBe(false);
    expect(result.canonicalUzbekPrompt).toBeTruthy();
  });

  it("marks low-confidence intent results as manual check needed", () => {
    const result = buildIntentSummary("translate politely", [
      {
        id: "1",
        recoveredIntent: "translate politely",
        confidence: IntentConfidence.LOW,
      },
    ]);

    expect(result.lowConfidence).toBe(true);
    expect(result.aggregateStatus).toBe(IntentMatchStatus.MANUAL_CHECK_NEEDED);
  });

  it("computes text mismatch conservatively", () => {
    expect(compareIntentText("refund eligibility with conditions", "deny refunds always")).toBe(
      IntentMatchStatus.MISMATCH,
    );
  });

  it("routes flagged prompts to pending spot check after intent completion", () => {
    const reviewSummary = buildReviewSummary([
      {
        id: "1",
        editedUzbekPrompt: "matn",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.CLEAR_DRIFT,
        finalDecision: ReviewDecision.KEEP,
      },
      {
        id: "2",
        editedUzbekPrompt: "matn",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.NONE,
        finalDecision: ReviewDecision.KEEP,
      },
    ]);
    const intentSummary = buildIntentSummary("translate politely", [
      {
        id: "1",
        recoveredIntent: "translate politely",
        confidence: IntentConfidence.HIGH,
      },
    ]);

    const state = computePromptState({
      prompt: {
        id: "prompt-a",
        status: PromptStatus.IN_INTENT_CHECK,
        requiredReviews: 2,
        requiredIntentChecks: 1,
        intendedIntent: "translate politely",
        canonicalUzbekPrompt: "matn",
        manualSpotCheckRequested: false,
        extraReviewRequested: false,
        randomSpotCheckSelected: false,
        finalDecision: null,
        completedReviewAssignments: 2,
        openReviewAssignments: 0,
        completedIntentAssignments: 1,
        openIntentAssignments: 0,
        spotChecks: [],
      },
      settings: {
        requiredReviews: 2,
        requiredIntentChecks: 1,
        randomSpotCheckPercentage: 0,
        lowConfidenceTriggersSpotCheck: true,
        mismatchTriggersSpotCheck: true,
      },
      reviewSummary,
      intentSummary,
      canonicalDecision: {
        canonicalUzbekPrompt: "matn",
        needsCanonicalSelection: false,
        normalizedOptions: ["matn"],
        consensus: true,
      },
    });

    expect(state.status).toBe(PromptStatus.PENDING_SPOT_CHECK);
  });

  it("auto-approves clean prompts after review and intent check", () => {
    const reviewSummary = buildReviewSummary([
      {
        id: "1",
        editedUzbekPrompt: "matn",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.NONE,
        finalDecision: ReviewDecision.KEEP,
      },
      {
        id: "2",
        editedUzbekPrompt: "matn",
        intentMatchesOriginal: "FULLY_MATCHES",
        harmCategoryMatches: "SAME_CATEGORY",
        strengthOfRequest: "SAME",
        meaningClarity: ReviewMeaningClarity.CLEAR,
        naturalness: ReviewNaturalness.NATURAL,
        meaningDrift: ReviewMeaningDrift.NONE,
        finalDecision: ReviewDecision.KEEP,
      },
    ]);

    const state = computePromptState({
      prompt: {
        id: "prompt-b",
        status: PromptStatus.IN_INTENT_CHECK,
        requiredReviews: 2,
        requiredIntentChecks: 1,
        intendedIntent: "translate politely",
        canonicalUzbekPrompt: "matn",
        manualSpotCheckRequested: false,
        extraReviewRequested: false,
        randomSpotCheckSelected: false,
        finalDecision: null,
        completedReviewAssignments: 2,
        openReviewAssignments: 0,
        completedIntentAssignments: 1,
        openIntentAssignments: 0,
        spotChecks: [],
      },
      settings: {
        requiredReviews: 2,
        requiredIntentChecks: 1,
        randomSpotCheckPercentage: 0,
        lowConfidenceTriggersSpotCheck: true,
        mismatchTriggersSpotCheck: true,
      },
      reviewSummary,
      intentSummary: {
        aggregateStatus: IntentMatchStatus.MATCH,
        lowConfidence: false,
        disagreement: false,
        individualStatuses: [IntentMatchStatus.MATCH],
      },
      canonicalDecision: {
        canonicalUzbekPrompt: "matn",
        needsCanonicalSelection: false,
        normalizedOptions: ["matn"],
        consensus: true,
      },
    });

    expect(state.finalDecision).toBe(FinalDecision.APPROVED);
    expect(state.status).toBe(PromptStatus.APPROVED);
  });
});

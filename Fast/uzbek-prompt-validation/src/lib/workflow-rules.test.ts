import {
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
  buildIntentSummary,
  buildReviewSummary,
  chooseCanonicalUzbek,
  compareIntentText,
  computePromptState,
  getCurrentReviewPrompt,
} from "@/lib/workflow-rules";

const makeReview = ({
  id,
  reviewerId,
  editedUzbekPrompt,
  translationChoice,
  finalDecision,
}: {
  id: string;
  reviewerId: string;
  editedUzbekPrompt: string;
  translationChoice: ReviewTranslationChoice;
  finalDecision: ReviewDecision;
}) => ({
  id,
  reviewerId,
  createdAt: new Date(`2026-01-${id.padStart(2, "0")}T10:00:00Z`),
  editedUzbekPrompt,
  translationChoice,
  intentMatchesOriginal: "FULLY_MATCHES",
  harmCategoryMatches: "SAME_CATEGORY",
  strengthOfRequest: "SAME",
  meaningClarity: ReviewMeaningClarity.CLEAR,
  naturalness: ReviewNaturalness.NATURAL,
  meaningDrift: ReviewMeaningDrift.NONE,
  finalDecision,
});

describe("workflow rules", () => {
  it("shows the most recent edited text as the current review prompt", () => {
    const currentPrompt = getCurrentReviewPrompt(
      [
        makeReview({
          id: "1",
          reviewerId: "reviewer-a",
          editedUzbekPrompt: "Boshlang'ich matn",
          translationChoice: ReviewTranslationChoice.KEEP_MT,
          finalDecision: ReviewDecision.KEEP,
        }),
        makeReview({
          id: "2",
          reviewerId: "reviewer-b",
          editedUzbekPrompt: "Tahrir qilingan matn",
          translationChoice: ReviewTranslationChoice.EDIT_TRANSLATION,
          finalDecision: ReviewDecision.REVISE,
        }),
      ],
      "Boshlang'ich matn",
    );

    expect(currentPrompt).toBe("Tahrir qilingan matn");
  });

  it("treats edit plus one keep from another reviewer as sufficient confirmation", () => {
    const canonical = chooseCanonicalUzbek(
      [
        makeReview({
          id: "1",
          reviewerId: "reviewer-a",
          editedUzbekPrompt: "Yakuniy matn",
          translationChoice: ReviewTranslationChoice.EDIT_TRANSLATION,
          finalDecision: ReviewDecision.REVISE,
        }),
        makeReview({
          id: "2",
          reviewerId: "reviewer-b",
          editedUzbekPrompt: "Yakuniy matn",
          translationChoice: ReviewTranslationChoice.KEEP_MT,
          finalDecision: ReviewDecision.KEEP,
        }),
      ],
      "Boshlang'ich matn",
      null,
      2,
    );

    expect(canonical.reviewTargetReached).toBe(true);
    expect(canonical.canonicalUzbekPrompt).toBe("Yakuniy matn");
  });

  it("requires two keep confirmations after a not-sure review", () => {
    const canonical = chooseCanonicalUzbek(
      [
        makeReview({
          id: "1",
          reviewerId: "reviewer-a",
          editedUzbekPrompt: "Boshlang'ich matn",
          translationChoice: ReviewTranslationChoice.NOT_SURE,
          finalDecision: ReviewDecision.NEEDS_SECOND_REVIEW,
        }),
        makeReview({
          id: "2",
          reviewerId: "reviewer-b",
          editedUzbekPrompt: "Yangi matn",
          translationChoice: ReviewTranslationChoice.EDIT_TRANSLATION,
          finalDecision: ReviewDecision.REVISE,
        }),
        makeReview({
          id: "3",
          reviewerId: "reviewer-c",
          editedUzbekPrompt: "Yangi matn",
          translationChoice: ReviewTranslationChoice.KEEP_MT,
          finalDecision: ReviewDecision.KEEP,
        }),
      ],
      "Boshlang'ich matn",
      null,
      2,
    );

    expect(canonical.reviewTargetReached).toBe(false);
    expect(canonical.currentReviewPrompt).toBe("Yangi matn");
  });

  it("keeps prompts in review after not sure plus only one keep", () => {
    const reviews = [
      makeReview({
        id: "1",
        reviewerId: "reviewer-a",
        editedUzbekPrompt: "Matn",
        translationChoice: ReviewTranslationChoice.NOT_SURE,
        finalDecision: ReviewDecision.NEEDS_SECOND_REVIEW,
      }),
      makeReview({
        id: "2",
        reviewerId: "reviewer-b",
        editedUzbekPrompt: "Matn",
        translationChoice: ReviewTranslationChoice.KEEP_MT,
        finalDecision: ReviewDecision.KEEP,
      }),
    ];

    const state = computePromptState({
      prompt: {
        id: "prompt-a",
        status: PromptStatus.IN_REVIEW,
        requiredReviews: 2,
        requiredIntentChecks: 0,
        intendedIntent: null,
        canonicalUzbekPrompt: null,
        manualSpotCheckRequested: false,
        extraReviewRequested: false,
        randomSpotCheckSelected: false,
        finalDecision: null,
        completedReviewAssignments: 2,
        openReviewAssignments: 0,
        completedIntentAssignments: 0,
        openIntentAssignments: 0,
        spotChecks: [],
      },
      settings: {
        requiredReviews: 2,
        intentCheckEnabled: false,
        requiredIntentChecks: 0,
        spotCheckEnabled: false,
        randomSpotCheckPercentage: 0,
        lowConfidenceTriggersSpotCheck: false,
        mismatchTriggersSpotCheck: false,
      },
      reviewSummary: buildReviewSummary(reviews),
      intentSummary: {
        aggregateStatus: null,
        lowConfidence: false,
        disagreement: false,
        individualStatuses: [],
      },
      canonicalDecision: chooseCanonicalUzbek(reviews, "Matn", null, 2),
    });

    expect(state.status).toBe(PromptStatus.IN_REVIEW);
  });

  it("auto-approves after confirmation when intent and spot checks are disabled", () => {
    const reviews = [
      makeReview({
        id: "1",
        reviewerId: "reviewer-a",
        editedUzbekPrompt: "Yakuniy matn",
        translationChoice: ReviewTranslationChoice.KEEP_MT,
        finalDecision: ReviewDecision.KEEP,
      }),
      makeReview({
        id: "2",
        reviewerId: "reviewer-b",
        editedUzbekPrompt: "Yakuniy matn",
        translationChoice: ReviewTranslationChoice.KEEP_MT,
        finalDecision: ReviewDecision.KEEP,
      }),
    ];

    const state = computePromptState({
      prompt: {
        id: "prompt-b",
        status: PromptStatus.IN_REVIEW,
        requiredReviews: 2,
        requiredIntentChecks: 0,
        intendedIntent: null,
        canonicalUzbekPrompt: null,
        manualSpotCheckRequested: false,
        extraReviewRequested: false,
        randomSpotCheckSelected: false,
        finalDecision: null,
        completedReviewAssignments: 2,
        openReviewAssignments: 0,
        completedIntentAssignments: 0,
        openIntentAssignments: 0,
        spotChecks: [],
      },
      settings: {
        requiredReviews: 2,
        intentCheckEnabled: false,
        requiredIntentChecks: 0,
        spotCheckEnabled: false,
        randomSpotCheckPercentage: 0,
        lowConfidenceTriggersSpotCheck: false,
        mismatchTriggersSpotCheck: false,
      },
      reviewSummary: buildReviewSummary(reviews),
      intentSummary: {
        aggregateStatus: null,
        lowConfidence: false,
        disagreement: false,
        individualStatuses: [],
      },
      canonicalDecision: chooseCanonicalUzbek(reviews, "Boshlang'ich matn", null, 2),
    });

    expect(state.status).toBe(PromptStatus.APPROVED);
    expect(state.finalDecision).toBe("APPROVED");
  });

  it("routes confirmed reviews into intent check when the dataset enables it", () => {
    const reviews = [
      makeReview({
        id: "1",
        reviewerId: "reviewer-a",
        editedUzbekPrompt: "Boshlang'ich matn",
        translationChoice: ReviewTranslationChoice.KEEP_MT,
        finalDecision: ReviewDecision.KEEP,
      }),
      makeReview({
        id: "2",
        reviewerId: "reviewer-b",
        editedUzbekPrompt: "Boshlang'ich matn",
        translationChoice: ReviewTranslationChoice.KEEP_MT,
        finalDecision: ReviewDecision.KEEP,
      }),
    ];

    const state = computePromptState({
      prompt: {
        id: "prompt-c",
        status: PromptStatus.IN_REVIEW,
        requiredReviews: 2,
        requiredIntentChecks: 1,
        intendedIntent: "translate politely",
        canonicalUzbekPrompt: null,
        manualSpotCheckRequested: false,
        extraReviewRequested: false,
        randomSpotCheckSelected: false,
        finalDecision: null,
        completedReviewAssignments: 2,
        openReviewAssignments: 0,
        completedIntentAssignments: 0,
        openIntentAssignments: 0,
        spotChecks: [],
      },
      settings: {
        requiredReviews: 2,
        intentCheckEnabled: true,
        requiredIntentChecks: 1,
        spotCheckEnabled: false,
        randomSpotCheckPercentage: 0,
        lowConfidenceTriggersSpotCheck: false,
        mismatchTriggersSpotCheck: false,
      },
      reviewSummary: buildReviewSummary(reviews),
      intentSummary: {
        aggregateStatus: null,
        lowConfidence: false,
        disagreement: false,
        individualStatuses: [],
      },
      canonicalDecision: chooseCanonicalUzbek(reviews, "Boshlang'ich matn", null, 2),
    });

    expect(state.status).toBe(PromptStatus.PENDING_INTENT_CHECK);
    expect(state.finalDecision).toBeNull();
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
});

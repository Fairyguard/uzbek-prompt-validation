import { hash } from "bcryptjs";
import {
  AssignmentStatus,
  IntentConfidence,
  PrismaClient,
  ReviewDecision,
  ReviewHarmCategoryMatch,
  ReviewIntentMatch,
  ReviewMeaningClarity,
  ReviewMeaningDrift,
  ReviewNaturalness,
  ReviewStrengthOfRequest,
  ReviewTranslationChoice,
  RoleName,
  TaskType,
} from "@prisma/client";
import { DEFAULT_REVIEW_INSTRUCTIONS, DEFAULT_REVIEW_QUESTIONS } from "../src/lib/constants";
import { recomputePromptState } from "../src/lib/workflow-service";

const prisma = new PrismaClient();

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function ensureRoles(tx: Tx) {
  for (const roleName of Object.values(RoleName)) {
    await tx.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }
}

async function createUser(
  tx: Tx,
  input: {
    name: string;
    email: string;
    roles: RoleName[];
  },
) {
  const passwordHash = await hash("demo12345", 10);
  const roleRecords = await tx.role.findMany({
    where: { name: { in: input.roles } },
  });

  return tx.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      roles: {
        create: roleRecords.map((role) => ({
          roleId: role.id,
        })),
      },
    },
  });
}

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.deleteMany();
    await tx.spotCheck.deleteMany();
    await tx.intentCheck.deleteMany();
    await tx.review.deleteMany();
    await tx.assignment.deleteMany();
    await tx.prompt.deleteMany();
    await tx.datasetSettings.deleteMany();
    await tx.dataset.deleteMany();
    await tx.userRole.deleteMany();
    await tx.user.deleteMany();
    await tx.role.deleteMany();

    await ensureRoles(tx);

    const admin = await createUser(tx, {
      name: "Admin Researcher",
      email: "admin@local.test",
      roles: [RoleName.ADMIN],
    });
    const reviewerOne = await createUser(tx, {
      name: "Reviewer One",
      email: "reviewer1@local.test",
      roles: [RoleName.REVIEWER],
    });
    const reviewerTwo = await createUser(tx, {
      name: "Reviewer Two",
      email: "reviewer2@local.test",
      roles: [RoleName.REVIEWER],
    });
    const intentChecker = await createUser(tx, {
      name: "Intent Checker",
      email: "intent@local.test",
      roles: [RoleName.INTENT_CHECKER],
    });
    await createUser(tx, {
      name: "Spot Checker",
      email: "spot@local.test",
      roles: [RoleName.SPOT_CHECKER],
    });
    const multiRole = await createUser(tx, {
      name: "Multi Role Evaluator",
      email: "multi@local.test",
      roles: [RoleName.REVIEWER, RoleName.INTENT_CHECKER],
    });

    const dataset = await tx.dataset.create({
      data: {
        name: "Demo Uzbek Prompt Validation Set",
        description:
          "Seed dataset covering approval, disagreement, low confidence, mismatch, revision, and rejection flows.",
        sourceFilename: "demo-seed.xlsx",
        createdById: admin.id,
        settings: {
          create: {
            reviewInstructions: DEFAULT_REVIEW_INSTRUCTIONS,
            reviewQuestions: JSON.stringify(DEFAULT_REVIEW_QUESTIONS),
            requiredReviews: 2,
            intentCheckEnabled: false,
            requiredIntentChecks: 0,
            spotCheckEnabled: false,
            randomSpotCheckPercentage: 0,
            lowConfidenceTriggersSpotCheck: false,
            mismatchTriggersSpotCheck: false,
            extraSafetyFactors: JSON.stringify([]),
          },
        },
      },
    });

    const prompts = {
      approved: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-001",
          category: "benign_rewrite",
          englishPrompt:
            "Rewrite this customer-support request in polite Uzbek without changing its meaning.",
          mtUzbekPrompt:
            "Mijozlarni qo'llab-quvvatlash so'rovini ma'nosini o'zgartirmasdan muloyim o'zbekchada qayta yozing.",
          intendedIntent:
            "Politely rewrite a customer-support request in Uzbek while preserving meaning.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
      pendingSpot: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-002",
          category: "safety_sensitive_warning",
          englishPrompt: "Translate a warning about unsafe battery charging shortcuts into Uzbek.",
          mtUzbekPrompt:
            "Batareyani xavfsiz bo'lmagan tez zaryadlash yo'llari haqidagi ogohlantirishni o'zbek tiliga tarjima qiling.",
          intendedIntent:
            "Translate a warning message about unsafe battery charging shortcuts into Uzbek.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
      pendingReview: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-003",
          category: "tone_preservation",
          englishPrompt:
            "Translate this calm de-escalation prompt into Uzbek while keeping the tone gentle.",
          mtUzbekPrompt:
            "Ushbu tinchlantiruvchi matnni o'zbekchaga tarjima qiling va ohangni yumshoq saqlang.",
          intendedIntent:
            "Translate a calm de-escalation prompt into Uzbek while keeping a gentle tone.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
      inReview: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-004",
          category: "urgency",
          englishPrompt:
            "Translate this urgent customer email into Uzbek without softening the urgency.",
          mtUzbekPrompt:
            "Ushbu shoshilinch mijoz xatini o'zbek tiliga tarjima qiling va shoshilinchlikni yumshatmang.",
          intendedIntent:
            "Translate an urgent customer email into Uzbek without reducing urgency.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
      reviewed: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-005",
          category: "directness_shift",
          englishPrompt:
            "Translate this direct request into Uzbek and preserve the same level of directness.",
          mtUzbekPrompt:
            "Ushbu to'g'ridan-to'g'ri so'rovni o'zbekchaga tarjima qiling va shu darajadagi to'g'rilikni saqlang.",
          intendedIntent: "Translate a direct request into Uzbek while preserving directness.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
      inIntent: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-006",
          category: "policy_sensitive",
          englishPrompt:
            "Translate this policy reminder into Uzbek without changing the compliance requirement.",
          mtUzbekPrompt:
            "Ushbu siyosat eslatmasini o'zbekchaga tarjima qiling va muvofiqlik talabini o'zgartirmang.",
          intendedIntent:
            "Translate a policy reminder into Uzbek while preserving the compliance requirement.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
      needsRevision: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-007",
          category: "directness",
          englishPrompt: "Translate this firm but respectful instruction into Uzbek.",
          mtUzbekPrompt: "Ushbu qat'iy, ammo hurmatli ko'rsatmani o'zbekchaga tarjima qiling.",
          intendedIntent: "Translate a firm but respectful instruction into Uzbek.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
      rejected: await tx.prompt.create({
        data: {
          datasetId: dataset.id,
          promptId: "uzv-008",
          category: "meaning_mismatch",
          englishPrompt:
            "Translate this refund eligibility statement into Uzbek without changing eligibility conditions.",
          mtUzbekPrompt:
            "Ushbu to'lovni qaytarish shartlari bayonotini o'zbekchaga tarjima qiling va shartlarni o'zgartirmang.",
          intendedIntent:
            "Translate a refund eligibility statement into Uzbek while preserving the conditions.",
          requiredReviews: 2,
          requiredIntentChecks: 1,
        },
      }),
    };

    async function createReviewRecord(input: {
      promptId: string;
      reviewerId: string;
      editedUzbekPrompt: string;
      translationChoice?: ReviewTranslationChoice;
      finalDecision?: ReviewDecision;
      intentMatchesOriginal?: ReviewIntentMatch;
      harmCategoryMatches?: ReviewHarmCategoryMatch;
      strengthOfRequest?: ReviewStrengthOfRequest;
      meaningClarity?: ReviewMeaningClarity;
      naturalness?: ReviewNaturalness;
      meaningDrift?: ReviewMeaningDrift;
      complete?: boolean;
    }) {
      const prompt = await tx.prompt.findUniqueOrThrow({ where: { id: input.promptId } });
      const assignment = await tx.assignment.create({
        data: {
          promptId: input.promptId,
          userId: input.reviewerId,
          taskType: TaskType.REVIEW,
          status: input.complete === false ? AssignmentStatus.ASSIGNED : AssignmentStatus.COMPLETED,
          assignedById: admin.id,
          completedAt: input.complete === false ? null : new Date(),
        },
      });

      if (input.complete === false) {
        return assignment;
      }

      await tx.review.create({
        data: {
          assignmentId: assignment.id,
          promptId: input.promptId,
          reviewerId: input.reviewerId,
          originalMtUzbekPrompt: prompt.mtUzbekPrompt,
          translationChoice:
            input.translationChoice ??
            (input.editedUzbekPrompt.trim() === prompt.mtUzbekPrompt.trim()
              ? ReviewTranslationChoice.KEEP_MT
              : ReviewTranslationChoice.EDIT_TRANSLATION),
          editedUzbekPrompt: input.editedUzbekPrompt,
          intentMatchesOriginal: input.intentMatchesOriginal ?? ReviewIntentMatch.FULLY_MATCHES,
          harmCategoryMatches: input.harmCategoryMatches ?? ReviewHarmCategoryMatch.SAME_CATEGORY,
          strengthOfRequest: input.strengthOfRequest ?? ReviewStrengthOfRequest.SAME,
          meaningClarity: input.meaningClarity ?? ReviewMeaningClarity.CLEAR,
          naturalness: input.naturalness ?? ReviewNaturalness.NATURAL,
          meaningDrift: input.meaningDrift ?? ReviewMeaningDrift.NONE,
          finalDecision: input.finalDecision ?? ReviewDecision.KEEP,
          extraFactorAnswers: JSON.stringify({
            tone_preservation: "preserved",
            aggressiveness_preservation: "preserved",
          }),
        },
      });
    }

    async function createIntentRecord(input: {
      promptId: string;
      checkerId: string;
      recoveredIntent?: string;
      confidence?: IntentConfidence;
      complete?: boolean;
    }) {
      const assignment = await tx.assignment.create({
        data: {
          promptId: input.promptId,
          userId: input.checkerId,
          taskType: TaskType.INTENT_CHECK,
          status: input.complete === false ? AssignmentStatus.ASSIGNED : AssignmentStatus.COMPLETED,
          assignedById: admin.id,
          completedAt: input.complete === false ? null : new Date(),
        },
      });

      if (input.complete === false) {
        return assignment;
      }

      await tx.intentCheck.create({
        data: {
          assignmentId: assignment.id,
          promptId: input.promptId,
          intentCheckerId: input.checkerId,
          recoveredIntent:
            input.recoveredIntent ??
            "Translate the prompt into Uzbek without changing the intended meaning.",
          confidence: input.confidence ?? IntentConfidence.HIGH,
        },
      });
    }

    await createReviewRecord({
      promptId: prompts.approved.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt:
        "Mijozlarni qo'llab-quvvatlash so'rovini ma'nosini saqlagan holda muloyim o'zbek tilida qayta yozing.",
    });
    await createReviewRecord({
      promptId: prompts.approved.id,
      reviewerId: reviewerTwo.id,
      editedUzbekPrompt:
        "Mijozlarni qo'llab-quvvatlash so'rovini ma'nosini saqlagan holda muloyim o'zbek tilida qayta yozing.",
    });
    await createIntentRecord({
      promptId: prompts.approved.id,
      checkerId: intentChecker.id,
      recoveredIntent:
        "Politely rewrite a customer support request in Uzbek while keeping the same meaning.",
      confidence: IntentConfidence.HIGH,
    });

    await createReviewRecord({
      promptId: prompts.pendingSpot.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt:
        "Batareyani xavfsiz bo'lmagan tez zaryadlash usullaridan ogohlantiruvchi matnni o'zbek tiliga tarjima qiling.",
      finalDecision: ReviewDecision.NEEDS_SECOND_REVIEW,
      meaningClarity: ReviewMeaningClarity.SOMEWHAT_UNCLEAR,
      naturalness: ReviewNaturalness.ACCEPTABLE_BUT_AWKWARD,
    });
    await createReviewRecord({
      promptId: prompts.pendingSpot.id,
      reviewerId: reviewerTwo.id,
      editedUzbekPrompt:
        "Batareyani xavfsiz bo'lmagan tez zaryadlash usullaridan ogohlantiruvchi matnni o'zbek tiliga tarjima qiling.",
      finalDecision: ReviewDecision.REJECT,
      meaningDrift: ReviewMeaningDrift.CLEAR_DRIFT,
      naturalness: ReviewNaturalness.UNNATURAL,
      intentMatchesOriginal: ReviewIntentMatch.PARTLY_MATCHES,
    });
    await createIntentRecord({
      promptId: prompts.pendingSpot.id,
      checkerId: multiRole.id,
      recoveredIntent:
        "Something about charging a battery quickly, but the exact warning is unclear.",
      confidence: IntentConfidence.LOW,
    });
    await createReviewRecord({
      promptId: prompts.pendingReview.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt: prompts.pendingReview.mtUzbekPrompt,
      complete: false,
    });

    await createReviewRecord({
      promptId: prompts.inReview.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt:
        "Ushbu shoshilinch mijoz xatini o'zbek tiliga tarjima qiling va shoshilinch ohangni yumshatmang.",
    });
    await createReviewRecord({
      promptId: prompts.inReview.id,
      reviewerId: multiRole.id,
      editedUzbekPrompt: prompts.inReview.mtUzbekPrompt,
      complete: false,
    });

    await createReviewRecord({
      promptId: prompts.reviewed.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt:
        "Ushbu to'g'ridan-to'g'ri so'rovni o'zbekchaga tarjima qiling va to'g'ridan-to'g'riligini saqlang.",
    });
    await createReviewRecord({
      promptId: prompts.reviewed.id,
      reviewerId: reviewerTwo.id,
      editedUzbekPrompt: "Ushbu so'rovni o'zbekchaga aniq va bevosita ohangda tarjima qiling.",
      finalDecision: ReviewDecision.REVISE,
    });

    await createReviewRecord({
      promptId: prompts.inIntent.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt:
        "Ushbu siyosat eslatmasini o'zbekchaga tarjima qiling va muvofiqlik talabini o'zgartirmang.",
    });
    await createReviewRecord({
      promptId: prompts.inIntent.id,
      reviewerId: reviewerTwo.id,
      editedUzbekPrompt:
        "Ushbu siyosat eslatmasini o'zbekchaga tarjima qiling va muvofiqlik talabini o'zgartirmang.",
    });

    await createReviewRecord({
      promptId: prompts.needsRevision.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt: "Ushbu qat'iy, ammo hurmatli ko'rsatmani o'zbekchaga tarjima qiling.",
      finalDecision: ReviewDecision.REVISE,
      strengthOfRequest: ReviewStrengthOfRequest.SOFTER,
    });
    await createReviewRecord({
      promptId: prompts.needsRevision.id,
      reviewerId: multiRole.id,
      editedUzbekPrompt: "Ushbu qat'iy, ammo hurmatli ko'rsatmani o'zbekchaga tarjima qiling.",
      finalDecision: ReviewDecision.REVISE,
      strengthOfRequest: ReviewStrengthOfRequest.SOFTER,
    });
    await createIntentRecord({
      promptId: prompts.needsRevision.id,
      checkerId: intentChecker.id,
      recoveredIntent: "Translate a firm but respectful instruction into Uzbek.",
      confidence: IntentConfidence.HIGH,
    });

    await createReviewRecord({
      promptId: prompts.rejected.id,
      reviewerId: reviewerOne.id,
      editedUzbekPrompt:
        "Ushbu to'lovni qaytarish shartlari bayonotini o'zbek tiliga tarjima qiling va shartlarni o'zgartirmang.",
    });
    await createReviewRecord({
      promptId: prompts.rejected.id,
      reviewerId: reviewerTwo.id,
      editedUzbekPrompt:
        "Ushbu to'lovni qaytarish shartlari bayonotini o'zbek tiliga tarjima qiling va shartlarni o'zgartirmang.",
    });
    await createIntentRecord({
      promptId: prompts.rejected.id,
      checkerId: multiRole.id,
      recoveredIntent:
        "Explain when a customer is never eligible for a refund under any condition.",
      confidence: IntentConfidence.HIGH,
    });

    for (const prompt of Object.values(prompts)) {
      await recomputePromptState(tx, prompt.id, admin.id);
    }
  });

  console.log("Seeded demo dataset and user accounts.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

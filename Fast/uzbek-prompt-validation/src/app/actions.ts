"use server";

import { hash } from "bcryptjs";
import {
  AssignmentStatus,
  FinalDecision,
  IntentConfidence,
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
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  DEFAULT_EXTRA_FACTOR_LABELS,
  DEFAULT_REVIEW_INSTRUCTIONS,
  ExtraFactorDefinition,
  getReviewerExtraFactors,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { addAuditLog, assignPromptToUser, autoAssignPrompts, recomputePromptState } from "@/lib/workflow-service";
import { parsePromptWorkbook } from "@/lib/xlsx";
import { slugifyLabel } from "@/lib/utils";

function withMessage(path: string, key: "notice" | "error", message: string) {
  const url = new URL(path, "http://local");
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
}

function getReturnTo(formData: FormData, fallback: string) {
  return String(formData.get("returnTo") || fallback);
}

function normalizeActionError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

async function ensureRoleRecords() {
  await prisma.$transaction(
    Object.values(RoleName).map((roleName) =>
      prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
      }),
    ),
  );
}

function parseExtraFactorDefinitions(input: string) {
  const labels = input
    .split(/\r?\n/)
    .map((label) => label.trim())
    .filter(Boolean);

  const uniqueLabels = [...new Set(labels)];

  const fallback = DEFAULT_EXTRA_FACTOR_LABELS.map((label) => ({
    key: slugifyLabel(label),
    label,
  }));

  if (uniqueLabels.length === 0) {
    return fallback;
  }

  return uniqueLabels.map((label) => ({
    key: slugifyLabel(label),
    label,
  })) satisfies ExtraFactorDefinition[];
}

const emailSchema = z.string().email();
const yesNoSchema = z.enum(["yes", "no"]);

export async function createUserAction(formData: FormData) {
  await requireRole(RoleName.ADMIN);

  const returnTo = getReturnTo(formData, "/admin/users");

  try {
    await ensureRoleRecords();

    const name = z.string().min(2).parse(formData.get("name"));
    const email = emailSchema.parse(String(formData.get("email")).toLowerCase());
    const password = z.string().min(8).parse(formData.get("password"));
    const roles = z.array(z.nativeEnum(RoleName)).min(1).parse(
      formData.getAll("roles").map((value) => String(value)),
    );

    const passwordHash = await hash(password, 10);
    const roleRecords = await prisma.role.findMany({
      where: { name: { in: roles } },
    });

    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roles: {
          create: roleRecords.map((role) => ({
            roleId: role.id,
          })),
        },
      },
    });

    revalidatePath("/admin/users");
    redirect(withMessage(returnTo, "notice", "User created."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function updateUserRolesAction(formData: FormData) {
  await requireRole(RoleName.ADMIN);

  const returnTo = getReturnTo(formData, "/admin/users");

  try {
    await ensureRoleRecords();

    const userId = z.string().min(1).parse(formData.get("userId"));
    const roles = z.array(z.nativeEnum(RoleName)).min(1).parse(
      formData.getAll("roles").map((value) => String(value)),
    );
    const roleRecords = await prisma.role.findMany({
      where: { name: { in: roles } },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        roles: {
          deleteMany: {},
          create: roleRecords.map((role) => ({ roleId: role.id })),
        },
      },
    });

    revalidatePath("/admin/users");
    redirect(withMessage(returnTo, "notice", "User roles updated."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function toggleUserActiveAction(formData: FormData) {
  await requireRole(RoleName.ADMIN);

  const returnTo = getReturnTo(formData, "/admin/users");

  try {
    const userId = z.string().min(1).parse(formData.get("userId"));
    const isActive = String(formData.get("isActive")) === "true";

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: !isActive },
    });

    revalidatePath("/admin/users");
    redirect(withMessage(returnTo, "notice", "User status updated."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function resetPasswordAction(formData: FormData) {
  await requireRole(RoleName.ADMIN);

  const returnTo = getReturnTo(formData, "/admin/users");

  try {
    const userId = z.string().min(1).parse(formData.get("userId"));
    const password = z.string().min(8).parse(formData.get("password"));

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hash(password, 10),
      },
    });

    revalidatePath("/admin/users");
    redirect(withMessage(returnTo, "notice", "Password reset."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function importDatasetAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/datasets");

  try {
    const name = z.string().min(2).parse(formData.get("name"));
    const description = String(formData.get("description") ?? "").trim() || null;
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Select an XLSX file to import.");
    }

    const buffer = await file.arrayBuffer();
    const rows = parsePromptWorkbook(buffer);
    const promptIds = rows.map((row) => row.prompt_id);
    const duplicateIds = promptIds.filter((item, index) => promptIds.indexOf(item) !== index);

    if (duplicateIds.length > 0) {
      throw new Error(`Duplicate prompt_id values found: ${[...new Set(duplicateIds)].join(", ")}`);
    }

    const dataset = await prisma.$transaction(async (tx) => {
      const datasetRecord = await tx.dataset.create({
        data: {
          name,
          description,
          sourceFilename: file.name,
          createdById: session.user.id,
          settings: {
            create: {
              reviewInstructions: DEFAULT_REVIEW_INSTRUCTIONS,
              requiredReviews: 2,
              requiredIntentChecks: 1,
              randomSpotCheckPercentage: 10,
              lowConfidenceTriggersSpotCheck: true,
              mismatchTriggersSpotCheck: true,
              extraSafetyFactors: JSON.stringify(
                DEFAULT_EXTRA_FACTOR_LABELS.map((label) => ({
                  key: slugifyLabel(label),
                  label,
                })),
              ),
            },
          },
        },
      });

      await tx.prompt.createMany({
        data: rows.map((row) => ({
          datasetId: datasetRecord.id,
          promptId: row.prompt_id,
          category: row.category,
          englishPrompt: row.english_prompt,
          mtUzbekPrompt: row.mt_uzbek_prompt,
          intendedIntent: row.intended_intent || null,
          notes: row.notes || null,
          status: PromptStatus.PENDING_REVIEW,
          requiredReviews: 2,
          requiredIntentChecks: 1,
        })),
      });

      await addAuditLog(tx, {
        datasetId: datasetRecord.id,
        actorId: session.user.id,
        action: "dataset_imported",
        metadata: {
          promptCount: rows.length,
          sourceFilename: file.name,
        },
      });

      return datasetRecord;
    });

    revalidatePath("/admin/datasets");
    redirect(withMessage(`${returnTo}?datasetId=${dataset.id}`, "notice", "Dataset imported."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function updateDatasetSettingsAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/settings");

  try {
    const datasetId = z.string().min(1).parse(formData.get("datasetId"));
    const reviewInstructions = z.string().min(10).parse(formData.get("reviewInstructions"));
    const requiredReviews = z.coerce.number().int().min(1).max(10).parse(formData.get("requiredReviews"));
    const requiredIntentChecks = z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .parse(formData.get("requiredIntentChecks"));
    const randomSpotCheckPercentage = z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .parse(formData.get("randomSpotCheckPercentage"));
    const lowConfidenceTriggersSpotCheck = String(formData.get("lowConfidenceTriggersSpotCheck")) === "on";
    const mismatchTriggersSpotCheck = String(formData.get("mismatchTriggersSpotCheck")) === "on";
    const extraSafetyFactorsText = String(formData.get("extraSafetyFactors") ?? "");
    const optionalSafetyFactorsNote = String(formData.get("optionalSafetyFactorsNote") ?? "").trim() || null;
    const extraSafetyFactors = parseExtraFactorDefinitions(extraSafetyFactorsText);

    await prisma.$transaction(async (tx) => {
      await tx.datasetSettings.update({
        where: { datasetId },
        data: {
          reviewInstructions,
          requiredReviews,
          requiredIntentChecks,
          randomSpotCheckPercentage,
          lowConfidenceTriggersSpotCheck,
          mismatchTriggersSpotCheck,
          extraSafetyFactors: JSON.stringify(extraSafetyFactors),
          optionalSafetyFactorsNote,
        },
      });

      await tx.prompt.updateMany({
        where: {
          datasetId,
          finalDecision: null,
        },
        data: {
          requiredReviews,
          requiredIntentChecks,
        },
      });

      const prompts = await tx.prompt.findMany({
        where: { datasetId },
        select: { id: true },
      });

      for (const prompt of prompts) {
        await recomputePromptState(tx, prompt.id, session.user.id);
      }

      await addAuditLog(tx, {
        datasetId,
        actorId: session.user.id,
        action: "dataset_settings_updated",
        metadata: {
          requiredReviews,
          requiredIntentChecks,
          randomSpotCheckPercentage,
        },
      });
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/prompts");
    redirect(withMessage(returnTo, "notice", "Dataset settings updated."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function manualAssignAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const promptId = z.string().min(1).parse(formData.get("promptId"));
    const userId = z.string().min(1).parse(formData.get("userId"));
    const taskType = z.nativeEnum(TaskType).parse(formData.get("taskType"));
    const notes = String(formData.get("notes") ?? "").trim() || undefined;
    const overrideLimit = String(formData.get("overrideLimit")) === "on";

    await assignPromptToUser({
      promptId,
      userId,
      taskType,
      actorId: session.user.id,
      notes,
      overrideLimit,
    });

    revalidatePath("/admin/prompts");
    redirect(withMessage(returnTo, "notice", "Assignment created."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function autoAssignAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const datasetId = z.string().min(1).parse(formData.get("datasetId"));
    const userId = z.string().min(1).parse(formData.get("userId"));
    const taskType = z.nativeEnum(TaskType).parse(formData.get("taskType"));
    const count = z.coerce.number().int().min(1).max(100).parse(formData.get("count"));
    const overrideLimit = String(formData.get("overrideLimit")) === "on";

    const assignedCount = await autoAssignPrompts({
      datasetId,
      userId,
      taskType,
      count,
      actorId: session.user.id,
      overrideLimit,
    });

    revalidatePath("/admin/prompts");
    redirect(withMessage(returnTo, "notice", `Assigned ${assignedCount} prompts.`));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function setCanonicalPromptAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const promptId = z.string().min(1).parse(formData.get("promptId"));
    const canonicalUzbekPrompt = z.string().min(2).parse(formData.get("canonicalUzbekPrompt"));

    await prisma.$transaction(async (tx) => {
      const prompt = await tx.prompt.update({
        where: { id: promptId },
        data: {
          canonicalUzbekPrompt,
          canonicalSelectedById: session.user.id,
          needsCanonicalSelection: false,
          finalDecision: null,
        },
      });

      await addAuditLog(tx, {
        datasetId: prompt.datasetId,
        promptId: prompt.id,
        actorId: session.user.id,
        action: "canonical_uzbek_selected",
      });

      await recomputePromptState(tx, prompt.id, session.user.id);
    });

    revalidatePath("/admin/prompts");
    redirect(withMessage(returnTo, "notice", "Canonical Uzbek prompt updated."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function forceSpotCheckAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const promptId = z.string().min(1).parse(formData.get("promptId"));

    await prisma.$transaction(async (tx) => {
      const prompt = await tx.prompt.update({
        where: { id: promptId },
        data: {
          manualSpotCheckRequested: true,
          finalDecision: null,
        },
      });

      await addAuditLog(tx, {
        datasetId: prompt.datasetId,
        promptId,
        actorId: session.user.id,
        action: "manual_spot_check_requested",
      });

      await recomputePromptState(tx, promptId, session.user.id);
    });

    revalidatePath("/admin/prompts");
    redirect(withMessage(returnTo, "notice", "Prompt sent to spot check."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function requestExtraReviewAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const promptId = z.string().min(1).parse(formData.get("promptId"));

    await prisma.$transaction(async (tx) => {
      const prompt = await tx.prompt.update({
        where: { id: promptId },
        data: {
          extraReviewRequested: true,
          finalDecision: null,
        },
      });

      await addAuditLog(tx, {
        datasetId: prompt.datasetId,
        promptId,
        actorId: session.user.id,
        action: "extra_review_requested",
      });

      await recomputePromptState(tx, promptId, session.user.id);
    });

    revalidatePath("/admin/prompts");
    redirect(withMessage(returnTo, "notice", "Extra review requested."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function overridePromptStatusAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const promptId = z.string().min(1).parse(formData.get("promptId"));
    const finalDecision = z.nativeEnum(FinalDecision).parse(formData.get("finalDecision"));

    await prisma.$transaction(async (tx) => {
      const prompt = await tx.prompt.update({
        where: { id: promptId },
        data: {
          finalDecision,
        },
      });

      await addAuditLog(tx, {
        datasetId: prompt.datasetId,
        promptId,
        actorId: session.user.id,
        action: "final_status_override",
        metadata: {
          finalDecision,
        },
      });

      await recomputePromptState(tx, promptId, session.user.id);
    });

    revalidatePath("/admin/prompts");
    redirect(withMessage(returnTo, "notice", "Final status updated."));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function submitReviewAction(formData: FormData) {
  const session = await requireRole(RoleName.REVIEWER);

  try {
    const assignmentId = z.string().min(1).parse(formData.get("assignmentId"));
    const translationChoice = z.nativeEnum(ReviewTranslationChoice).parse(
      formData.get("translationChoice"),
    );
    const notes = String(formData.get("notes") ?? "").trim() || null;

    await prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          prompt: {
            include: {
              dataset: {
                include: {
                  settings: true,
                },
              },
            },
          },
        },
      });

      if (
        !assignment ||
        assignment.userId !== session.user.id ||
        assignment.taskType !== TaskType.REVIEW ||
        assignment.status === AssignmentStatus.COMPLETED
      ) {
        throw new Error("Review assignment not found.");
      }

      const extraFactors = getReviewerExtraFactors(
        assignment.prompt.dataset.settings?.extraSafetyFactors
          ? (JSON.parse(assignment.prompt.dataset.settings.extraSafetyFactors) as ExtraFactorDefinition[])
          : [],
      );

      let editedUzbekPrompt = assignment.prompt.mtUzbekPrompt.trim();
      let intentMatchesOriginal: ReviewIntentMatch = ReviewIntentMatch.NOT_SURE;
      let harmCategoryMatches: ReviewHarmCategoryMatch = ReviewHarmCategoryMatch.NOT_SURE;
      let strengthOfRequest: ReviewStrengthOfRequest = ReviewStrengthOfRequest.NOT_SURE;
      let meaningClarity: ReviewMeaningClarity = ReviewMeaningClarity.NOT_SURE;
      let naturalness: ReviewNaturalness = ReviewNaturalness.NOT_SURE;
      let meaningDrift: ReviewMeaningDrift = ReviewMeaningDrift.NOT_SURE;
      let finalDecision: ReviewDecision = ReviewDecision.NEEDS_SECOND_REVIEW;
      let extraFactorAnswers: Record<string, string> = Object.fromEntries(
        extraFactors.map((factor) => [factor.key, "not_sure"]),
      );

      if (translationChoice !== ReviewTranslationChoice.NOT_SURE) {
        const intentPreserved = yesNoSchema.parse(formData.get("intentPreserved"));
        const strengthPreserved = yesNoSchema.parse(formData.get("strengthPreserved"));
        const harmCategoryPreserved = yesNoSchema.parse(formData.get("harmCategoryPreserved"));
        const naturalnessConfirmed = yesNoSchema.parse(formData.get("naturalnessConfirmed"));
        const meaningClarityConfirmed = yesNoSchema.parse(
          formData.get("meaningClarityConfirmed"),
        );
        const meaningPreserved = yesNoSchema.parse(formData.get("meaningPreserved"));
        const extraFactorSelections = extraFactors.map((factor) => ({
          key: factor.key,
          answer: yesNoSchema.parse(formData.get(`extraFactor:${factor.key}`)),
        }));
        const allChecksPassed =
          [
            intentPreserved,
            strengthPreserved,
            harmCategoryPreserved,
            naturalnessConfirmed,
            meaningClarityConfirmed,
            meaningPreserved,
          ].every((answer) => answer === "yes") &&
          extraFactorSelections.every((factor) => factor.answer === "yes");

        editedUzbekPrompt =
          translationChoice === ReviewTranslationChoice.KEEP_MT
            ? assignment.prompt.mtUzbekPrompt.trim()
            : z.string().min(2).parse(formData.get("editedUzbekPrompt")).trim();
        intentMatchesOriginal =
          intentPreserved === "yes"
            ? ReviewIntentMatch.FULLY_MATCHES
            : ReviewIntentMatch.DOES_NOT_MATCH;
        harmCategoryMatches =
          harmCategoryPreserved === "yes"
            ? ReviewHarmCategoryMatch.SAME_CATEGORY
            : ReviewHarmCategoryMatch.DIFFERENT_CATEGORY;
        strengthOfRequest =
          strengthPreserved === "yes"
            ? ReviewStrengthOfRequest.SAME
            : ReviewStrengthOfRequest.NOT_SURE;
        meaningClarity =
          meaningClarityConfirmed === "yes"
            ? ReviewMeaningClarity.CLEAR
            : ReviewMeaningClarity.UNCLEAR;
        naturalness =
          naturalnessConfirmed === "yes"
            ? ReviewNaturalness.NATURAL
            : ReviewNaturalness.UNNATURAL;
        meaningDrift =
          meaningPreserved === "yes"
            ? ReviewMeaningDrift.NONE
            : ReviewMeaningDrift.CLEAR_DRIFT;
        finalDecision = allChecksPassed ? ReviewDecision.KEEP : ReviewDecision.REVISE;
        extraFactorAnswers = Object.fromEntries(
          extraFactorSelections.map((factor) => [
            factor.key,
            factor.answer === "yes" ? "preserved" : "shifted",
          ]),
        );
      }

      await tx.review.create({
        data: {
          assignmentId: assignment.id,
          promptId: assignment.promptId,
          reviewerId: session.user.id,
          originalMtUzbekPrompt: assignment.prompt.mtUzbekPrompt,
          translationChoice,
          editedUzbekPrompt,
          intentMatchesOriginal,
          harmCategoryMatches,
          strengthOfRequest,
          meaningClarity,
          naturalness,
          meaningDrift,
          finalDecision,
          notes,
          extraFactorAnswers: JSON.stringify(extraFactorAnswers),
        },
      });

      await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await addAuditLog(tx, {
        datasetId: assignment.prompt.datasetId,
        promptId: assignment.promptId,
        actorId: session.user.id,
        action: "review_submitted",
        taskType: TaskType.REVIEW,
      });

      await recomputePromptState(tx, assignment.promptId, session.user.id);
    });

    revalidatePath("/reviewer/queue");
    const nextAssignment = await prisma.assignment.findFirst({
      where: {
        userId: session.user.id,
        taskType: TaskType.REVIEW,
        status: {
          in: [AssignmentStatus.ASSIGNED, AssignmentStatus.IN_PROGRESS],
        },
      },
      orderBy: {
        assignedAt: "asc",
      },
    });

    if (nextAssignment) {
      redirect(withMessage(`/reviewer/tasks/${nextAssignment.id}`, "notice", "Review submitted."));
    }

    redirect(withMessage("/reviewer/queue", "notice", "Review flow complete."));
  } catch (error) {
    redirect(withMessage("/reviewer/queue", "error", normalizeActionError(error)));
  }
}

export async function submitIntentCheckAction(formData: FormData) {
  const session = await requireRole(RoleName.INTENT_CHECKER);

  try {
    const assignmentId = z.string().min(1).parse(formData.get("assignmentId"));
    const recoveredIntent = z.string().min(5).parse(formData.get("recoveredIntent"));
    const categoryGuess = String(formData.get("categoryGuess") ?? "").trim() || null;
    const confidence = z.nativeEnum(IntentConfidence).parse(formData.get("confidence"));

    await prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          prompt: true,
        },
      });

      if (
        !assignment ||
        assignment.userId !== session.user.id ||
        assignment.taskType !== TaskType.INTENT_CHECK ||
        assignment.status === AssignmentStatus.COMPLETED
      ) {
        throw new Error("Intent-check assignment not found.");
      }

      await tx.intentCheck.create({
        data: {
          assignmentId: assignment.id,
          promptId: assignment.promptId,
          intentCheckerId: session.user.id,
          recoveredIntent,
          categoryGuess,
          confidence,
        },
      });

      await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await addAuditLog(tx, {
        datasetId: assignment.prompt.datasetId,
        promptId: assignment.promptId,
        actorId: session.user.id,
        action: "intent_check_submitted",
        taskType: TaskType.INTENT_CHECK,
      });

      await recomputePromptState(tx, assignment.promptId, session.user.id);
    });

    revalidatePath("/intent-checker/queue");
    redirect(withMessage("/intent-checker/queue", "notice", "Intent check submitted."));
  } catch (error) {
    redirect(withMessage("/intent-checker/queue", "error", normalizeActionError(error)));
  }
}

export async function submitSpotCheckAction(formData: FormData) {
  const session = await requireRole(RoleName.SPOT_CHECKER);

  try {
    const assignmentId = z.string().min(1).parse(formData.get("assignmentId"));
    const action = z.nativeEnum(SpotCheckAction).parse(formData.get("action"));
    const notes = String(formData.get("notes") ?? "").trim() || null;

    await prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          prompt: true,
        },
      });

      if (
        !assignment ||
        assignment.userId !== session.user.id ||
        assignment.taskType !== TaskType.SPOT_CHECK ||
        assignment.status === AssignmentStatus.COMPLETED
      ) {
        throw new Error("Spot-check assignment not found.");
      }

      await tx.spotCheck.create({
        data: {
          assignmentId: assignment.id,
          promptId: assignment.promptId,
          spotCheckerId: session.user.id,
          action,
          notes,
        },
      });

      await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await addAuditLog(tx, {
        datasetId: assignment.prompt.datasetId,
        promptId: assignment.promptId,
        actorId: session.user.id,
        action: "spot_check_submitted",
        taskType: TaskType.SPOT_CHECK,
        metadata: { action },
      });

      await recomputePromptState(tx, assignment.promptId, session.user.id);
    });

    revalidatePath("/spot-checker/queue");
    redirect(withMessage("/spot-checker/queue", "notice", "Spot check submitted."));
  } catch (error) {
    redirect(withMessage("/spot-checker/queue", "error", normalizeActionError(error)));
  }
}

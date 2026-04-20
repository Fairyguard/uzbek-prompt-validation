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
  ACTIVE_ASSIGNMENT_STATUSES,
  DEFAULT_REVIEW_INSTRUCTIONS,
  DEFAULT_REVIEW_QUESTIONS,
  isActiveAssignmentStatus,
  parseReviewQuestionLines,
  resolveReviewQuestions,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { addAuditLog, assignPromptToUser, autoAssignPrompts, recomputePromptState } from "@/lib/workflow-service";
import { getCurrentReviewPrompt } from "@/lib/workflow-rules";
import { parsePromptWorkbook } from "@/lib/xlsx";

function withMessage(path: string, key: "notice" | "error", message: string) {
  const url = new URL(path, "http://local");
  url.searchParams.set(key, message);
  return `${url.pathname}${url.search}`;
}

function getReturnTo(formData: FormData, fallback: string) {
  return String(formData.get("returnTo") || fallback);
}

function getUniqueStringValues(values: FormDataEntryValue[]) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
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

const emailSchema = z.string().email();
const yesNoSchema = z.enum(["yes", "no"]);

function mapAnswerToLegacyReviewFields(questionAnswers: Record<string, string>) {
  const intentPreserved = questionAnswers.intent_preserved;
  const harmCategoryPreserved = questionAnswers.harm_category_preserved;
  const strengthPreserved = questionAnswers.strength_preserved;
  const meaningClarityConfirmed = questionAnswers.meaning_clarity_confirmed;
  const naturalnessConfirmed = questionAnswers.naturalness_confirmed;
  const meaningPreserved = questionAnswers.meaning_preserved;

  return {
    intentMatchesOriginal:
      intentPreserved === "yes"
        ? ReviewIntentMatch.FULLY_MATCHES
        : intentPreserved === "no"
          ? ReviewIntentMatch.DOES_NOT_MATCH
          : ReviewIntentMatch.NOT_SURE,
    harmCategoryMatches:
      harmCategoryPreserved === "yes"
        ? ReviewHarmCategoryMatch.SAME_CATEGORY
        : harmCategoryPreserved === "no"
          ? ReviewHarmCategoryMatch.DIFFERENT_CATEGORY
          : ReviewHarmCategoryMatch.NOT_SURE,
    strengthOfRequest:
      strengthPreserved === "yes"
        ? ReviewStrengthOfRequest.SAME
        : ReviewStrengthOfRequest.NOT_SURE,
    meaningClarity:
      meaningClarityConfirmed === "yes"
        ? ReviewMeaningClarity.CLEAR
        : meaningClarityConfirmed === "no"
          ? ReviewMeaningClarity.UNCLEAR
          : ReviewMeaningClarity.NOT_SURE,
    naturalness:
      naturalnessConfirmed === "yes"
        ? ReviewNaturalness.NATURAL
        : naturalnessConfirmed === "no"
          ? ReviewNaturalness.UNNATURAL
          : ReviewNaturalness.NOT_SURE,
    meaningDrift:
      meaningPreserved === "yes"
        ? ReviewMeaningDrift.NONE
        : meaningPreserved === "no"
          ? ReviewMeaningDrift.CLEAR_DRIFT
          : ReviewMeaningDrift.NOT_SURE,
  };
}

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
              intentCheckEnabled: false,
              requiredReviews: 2,
              reviewQuestions: JSON.stringify(DEFAULT_REVIEW_QUESTIONS),
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
          requiredIntentChecks: 0,
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
    const reviewQuestions = parseReviewQuestionLines(String(formData.get("reviewQuestions") ?? ""));
    const intentCheckEnabled = String(formData.get("intentCheckEnabled")) === "on";
    const requiredIntentChecks = z.coerce
      .number()
      .int()
      .min(0)
      .max(10)
      .parse(formData.get("requiredIntentChecks"));
    const spotCheckEnabled = String(formData.get("spotCheckEnabled")) === "on";
    const randomSpotCheckPercentage = z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .parse(formData.get("randomSpotCheckPercentage"));
    const lowConfidenceTriggersSpotCheck = String(formData.get("lowConfidenceTriggersSpotCheck")) === "on";
    const mismatchTriggersSpotCheck = String(formData.get("mismatchTriggersSpotCheck")) === "on";
    const optionalSafetyFactorsNote = String(formData.get("optionalSafetyFactorsNote") ?? "").trim() || null;
    const nextRequiredIntentChecks = intentCheckEnabled ? Math.max(requiredIntentChecks, 1) : 0;
    const nextRandomSpotCheckPercentage = spotCheckEnabled ? randomSpotCheckPercentage : 0;
    const nextLowConfidenceTriggersSpotCheck =
      spotCheckEnabled && intentCheckEnabled && lowConfidenceTriggersSpotCheck;
    const nextMismatchTriggersSpotCheck =
      spotCheckEnabled && intentCheckEnabled && mismatchTriggersSpotCheck;

    await prisma.$transaction(async (tx) => {
      await tx.datasetSettings.update({
        where: { datasetId },
        data: {
          reviewInstructions,
          reviewQuestions: JSON.stringify(reviewQuestions),
          requiredReviews,
          intentCheckEnabled,
          requiredIntentChecks: nextRequiredIntentChecks,
          spotCheckEnabled,
          randomSpotCheckPercentage: nextRandomSpotCheckPercentage,
          lowConfidenceTriggersSpotCheck: nextLowConfidenceTriggersSpotCheck,
          mismatchTriggersSpotCheck: nextMismatchTriggersSpotCheck,
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
          requiredIntentChecks: nextRequiredIntentChecks,
          ...(spotCheckEnabled
            ? {}
            : {
                manualSpotCheckRequested: false,
                randomSpotCheckSelected: false,
                spotCheckRequired: false,
              }),
        },
      });

      if (!intentCheckEnabled) {
        const activeIntentAssignments = await tx.assignment.findMany({
          where: {
            taskType: TaskType.INTENT_CHECK,
            status: {
              in: [AssignmentStatus.ASSIGNED, AssignmentStatus.IN_PROGRESS],
            },
            prompt: {
              datasetId,
            },
          },
          select: { id: true },
        });

        if (activeIntentAssignments.length > 0) {
          await tx.assignment.updateMany({
            where: {
              id: {
                in: activeIntentAssignments.map((assignment) => assignment.id),
              },
            },
            data: {
              status: AssignmentStatus.CANCELLED,
              completedAt: new Date(),
            },
          });
        }
      }

      if (!spotCheckEnabled) {
        const activeSpotAssignments = await tx.assignment.findMany({
          where: {
            taskType: TaskType.SPOT_CHECK,
            status: {
              in: [AssignmentStatus.ASSIGNED, AssignmentStatus.IN_PROGRESS],
            },
            prompt: {
              datasetId,
            },
          },
          select: { id: true },
        });

        if (activeSpotAssignments.length > 0) {
          await tx.assignment.updateMany({
            where: {
              id: {
                in: activeSpotAssignments.map((assignment) => assignment.id),
              },
            },
            data: {
              status: AssignmentStatus.CANCELLED,
              completedAt: new Date(),
            },
          });
        }
      }

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
          requiredIntentChecks: nextRequiredIntentChecks,
          intentCheckEnabled,
          spotCheckEnabled,
          randomSpotCheckPercentage: nextRandomSpotCheckPercentage,
        },
      });
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/prompts");
    revalidatePath("/intent-checker/queue");
    revalidatePath("/spot-checker/queue");
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

export async function deleteDatasetAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/datasets");

  try {
    const datasetId = z.string().min(1).parse(formData.get("datasetId"));

    const dataset = await prisma.$transaction(async (tx) => {
      const existingDataset = await tx.dataset.findUnique({
        where: { id: datasetId },
        include: {
          _count: {
            select: {
              prompts: true,
            },
          },
        },
      });

      if (!existingDataset) {
        throw new Error("Dataset not found.");
      }

      await addAuditLog(tx, {
        actorId: session.user.id,
        action: "dataset_deleted",
        metadata: {
          deletedDatasetId: existingDataset.id,
          deletedDatasetName: existingDataset.name,
          promptCount: existingDataset._count.prompts,
          sourceFilename: existingDataset.sourceFilename,
        },
      });

      await tx.dataset.delete({
        where: { id: datasetId },
      });

      return existingDataset;
    });

    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/datasets");
    revalidatePath("/admin/prompts");
    revalidatePath("/admin/settings");
    redirect(withMessage(returnTo, "notice", `Dataset "${dataset.name}" was deleted permanently.`));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function deletePromptAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const promptId = z.string().min(1).parse(formData.get("promptId"));

    const prompt = await prisma.$transaction(async (tx) => {
      const existingPrompt = await tx.prompt.findUnique({
        where: { id: promptId },
        select: {
          id: true,
          datasetId: true,
          promptId: true,
          category: true,
        },
      });

      if (!existingPrompt) {
        throw new Error("Prompt not found.");
      }

      await addAuditLog(tx, {
        actorId: session.user.id,
        action: "prompt_deleted",
        metadata: {
          deletedPromptDbId: existingPrompt.id,
          deletedPromptId: existingPrompt.promptId,
          deletedPromptCategory: existingPrompt.category,
          datasetId: existingPrompt.datasetId,
        },
      });

      await tx.prompt.delete({
        where: { id: promptId },
      });

      return existingPrompt;
    });

    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/datasets");
    revalidatePath("/admin/prompts");
    revalidatePath(`/admin/prompts/${promptId}`);
    redirect(withMessage(returnTo, "notice", `Prompt "${prompt.promptId}" was deleted permanently.`));
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function bulkDeletePromptsAction(formData: FormData) {
  const session = await requireRole(RoleName.ADMIN);
  const returnTo = getReturnTo(formData, "/admin/prompts");

  try {
    const promptIds = z
      .array(z.string().min(1))
      .min(1, "Select at least one prompt to delete.")
      .parse(getUniqueStringValues(formData.getAll("promptIds")));

    const deletedCount = await prisma.$transaction(async (tx) => {
      const prompts = await tx.prompt.findMany({
        where: {
          id: {
            in: promptIds,
          },
        },
        select: {
          id: true,
          datasetId: true,
          promptId: true,
          category: true,
        },
      });

      if (prompts.length !== promptIds.length) {
        throw new Error("One or more prompts could not be found.");
      }

      await addAuditLog(tx, {
        actorId: session.user.id,
        action: "prompts_bulk_deleted",
        metadata: {
          deletedPromptCount: prompts.length,
          deletedPrompts: prompts.map((prompt) => ({
            id: prompt.id,
            promptId: prompt.promptId,
            category: prompt.category,
            datasetId: prompt.datasetId,
          })),
        },
      });

      const result = await tx.prompt.deleteMany({
        where: {
          id: {
            in: promptIds,
          },
        },
      });

      return result.count;
    });

    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/datasets");
    revalidatePath("/admin/prompts");
    promptIds.forEach((promptId) => {
      revalidatePath(`/admin/prompts/${promptId}`);
    });
    redirect(
      withMessage(
        returnTo,
        "notice",
        `Deleted ${deletedCount} prompt${deletedCount === 1 ? "" : "s"} permanently.`,
      ),
    );
  } catch (error) {
    redirect(withMessage(returnTo, "error", normalizeActionError(error)));
  }
}

export async function submitReviewAction(formData: FormData) {
  const session = await requireRole(RoleName.REVIEWER);
  const rawAssignmentId = String(formData.get("assignmentId") ?? "");
  let destinationPath = "/reviewer/queue";
  let destinationNotice = "Review flow complete.";

  try {
    const assignmentId = z.string().min(1).parse(rawAssignmentId);
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
              reviews: {
                orderBy: {
                  createdAt: "asc",
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
        !isActiveAssignmentStatus(assignment.status)
      ) {
        throw new Error("Review assignment not found.");
      }

      const reviewQuestions = resolveReviewQuestions(
        assignment.prompt.dataset.settings?.reviewQuestions,
        assignment.prompt.dataset.settings?.extraSafetyFactors,
      );
      const currentReviewPrompt = getCurrentReviewPrompt(
        assignment.prompt.reviews,
        assignment.prompt.mtUzbekPrompt,
        assignment.prompt.canonicalUzbekPrompt,
      );

      let editedUzbekPrompt = currentReviewPrompt;
      let intentMatchesOriginal: ReviewIntentMatch = ReviewIntentMatch.NOT_SURE;
      let harmCategoryMatches: ReviewHarmCategoryMatch = ReviewHarmCategoryMatch.NOT_SURE;
      let strengthOfRequest: ReviewStrengthOfRequest = ReviewStrengthOfRequest.NOT_SURE;
      let meaningClarity: ReviewMeaningClarity = ReviewMeaningClarity.NOT_SURE;
      let naturalness: ReviewNaturalness = ReviewNaturalness.NOT_SURE;
      let meaningDrift: ReviewMeaningDrift = ReviewMeaningDrift.NOT_SURE;
      let finalDecision: ReviewDecision = ReviewDecision.NEEDS_SECOND_REVIEW;
      let extraFactorAnswers: Record<string, string> = Object.fromEntries(
        reviewQuestions.map((question) => [question.key, "not_answered"]),
      );

      if (translationChoice !== ReviewTranslationChoice.NOT_SURE) {
        const questionSelections = reviewQuestions.map((question) => ({
          key: question.key,
          answer: yesNoSchema.parse(formData.get(`reviewQuestion:${question.key}`)),
        }));
        const questionAnswers = Object.fromEntries(
          questionSelections.map((question) => [question.key, question.answer]),
        );

        editedUzbekPrompt =
          translationChoice === ReviewTranslationChoice.KEEP_MT
            ? currentReviewPrompt
            : z.string().min(2).parse(formData.get("editedUzbekPrompt")).trim();
        ({
          intentMatchesOriginal,
          harmCategoryMatches,
          strengthOfRequest,
          meaningClarity,
          naturalness,
          meaningDrift,
        } = mapAnswerToLegacyReviewFields(questionAnswers));
        finalDecision =
          translationChoice === ReviewTranslationChoice.KEEP_MT
            ? ReviewDecision.KEEP
            : ReviewDecision.REVISE;
        extraFactorAnswers = questionAnswers;
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
          in: [...ACTIVE_ASSIGNMENT_STATUSES],
        },
      },
      orderBy: {
        assignedAt: "asc",
      },
    });

    if (nextAssignment) {
      destinationPath = `/reviewer/tasks/${nextAssignment.id}`;
      destinationNotice = "";
    } else {
      destinationPath = "/reviewer/queue";
      destinationNotice = "Review flow complete.";
    }
  } catch (error) {
    const returnPath = rawAssignmentId
      ? `/reviewer/tasks/${rawAssignmentId}`
      : "/reviewer/queue";
    redirect(withMessage(returnPath, "error", normalizeActionError(error)));
  }

  if (destinationNotice) {
    redirect(withMessage(destinationPath, "notice", destinationNotice));
  }

  redirect(destinationPath);
}

export async function submitIntentCheckAction(formData: FormData) {
  const session = await requireRole(RoleName.INTENT_CHECKER);
  const rawAssignmentId = String(formData.get("assignmentId") ?? "");
  let destinationPath = "/intent-checker/queue";
  let destinationNotice = "Intent check submitted.";

  try {
    const assignmentId = z.string().min(1).parse(rawAssignmentId);
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
        !isActiveAssignmentStatus(assignment.status)
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
    const nextAssignment = await prisma.assignment.findFirst({
      where: {
        userId: session.user.id,
        taskType: TaskType.INTENT_CHECK,
        status: {
          in: [...ACTIVE_ASSIGNMENT_STATUSES],
        },
      },
      orderBy: {
        assignedAt: "asc",
      },
    });

    if (nextAssignment) {
      destinationPath = `/intent-checker/tasks/${nextAssignment.id}`;
      destinationNotice = "";
    }
  } catch (error) {
    const returnPath = rawAssignmentId
      ? `/intent-checker/tasks/${rawAssignmentId}`
      : "/intent-checker/queue";
    redirect(withMessage(returnPath, "error", normalizeActionError(error)));
  }

  if (destinationNotice) {
    redirect(withMessage(destinationPath, "notice", destinationNotice));
  }

  redirect(destinationPath);
}

export async function submitSpotCheckAction(formData: FormData) {
  const session = await requireRole(RoleName.SPOT_CHECKER);
  const rawAssignmentId = String(formData.get("assignmentId") ?? "");
  let destinationPath = "/spot-checker/queue";
  let destinationNotice = "Spot check submitted.";

  try {
    const assignmentId = z.string().min(1).parse(rawAssignmentId);
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
        !isActiveAssignmentStatus(assignment.status)
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
    const nextAssignment = await prisma.assignment.findFirst({
      where: {
        userId: session.user.id,
        taskType: TaskType.SPOT_CHECK,
        status: {
          in: [...ACTIVE_ASSIGNMENT_STATUSES],
        },
      },
      orderBy: {
        assignedAt: "asc",
      },
    });

    if (nextAssignment) {
      destinationPath = `/spot-checker/tasks/${nextAssignment.id}`;
      destinationNotice = "";
    }
  } catch (error) {
    const returnPath = rawAssignmentId
      ? `/spot-checker/tasks/${rawAssignmentId}`
      : "/spot-checker/queue";
    redirect(withMessage(returnPath, "error", normalizeActionError(error)));
  }

  if (destinationNotice) {
    redirect(withMessage(destinationPath, "notice", destinationNotice));
  }

  redirect(destinationPath);
}

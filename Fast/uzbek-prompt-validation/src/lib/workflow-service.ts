import {
  AssignmentStatus,
  IntentMatchStatus,
  PromptStatus,
  Prisma,
  RoleName,
  TaskType,
} from "@prisma/client";
import { TASK_ROLE_MAP } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
  buildIntentSummary,
  buildReviewSummary,
  chooseCanonicalUzbek,
  compareIntentText,
  computePromptState,
} from "@/lib/workflow-rules";

const PROMPT_WORKFLOW_INCLUDE = {
  dataset: {
    include: {
      settings: true,
    },
  },
  assignments: true,
  reviews: {
    orderBy: {
      createdAt: "asc",
    },
  },
  intentChecks: {
    orderBy: {
      createdAt: "asc",
    },
  },
  spotChecks: {
    orderBy: {
      createdAt: "asc",
    },
  },
} satisfies Prisma.PromptInclude;

function countOpenAssignments(
  assignments: Array<{ taskType: TaskType; status: AssignmentStatus }>,
  taskType: TaskType,
) {
  return assignments.filter(
    (assignment) =>
      assignment.taskType === taskType &&
      assignment.status !== AssignmentStatus.COMPLETED &&
      assignment.status !== AssignmentStatus.CANCELLED,
  ).length;
}

export async function addAuditLog(
  tx: Prisma.TransactionClient,
  input: {
    datasetId?: string | null;
    promptId?: string | null;
    actorId?: string | null;
    action: string;
    fromStatus?: PromptStatus | null;
    toStatus?: PromptStatus | null;
    taskType?: TaskType | null;
    metadata?: unknown;
  },
) {
  await tx.auditLog.create({
    data: {
      datasetId: input.datasetId ?? null,
      promptId: input.promptId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      taskType: input.taskType ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

async function getPromptWorkflow(tx: Prisma.TransactionClient, promptId: string) {
  return tx.prompt.findUnique({
    where: { id: promptId },
    include: PROMPT_WORKFLOW_INCLUDE,
  });
}

function getIntentFallbackSummary() {
  return {
    aggregateStatus: null,
    lowConfidence: false,
    disagreement: false,
    individualStatuses: [],
  };
}

export async function recomputePromptState(
  tx: Prisma.TransactionClient,
  promptId: string,
  actorId?: string,
) {
  const prompt = await getPromptWorkflow(tx, promptId);

  if (!prompt || !prompt.dataset.settings) {
    throw new Error("Prompt or dataset settings not found.");
  }

  const reviewTarget = prompt.requiredReviews + (prompt.extraReviewRequested ? 1 : 0);
  const reviewSummary = buildReviewSummary(prompt.reviews);
  const canonicalDecision = chooseCanonicalUzbek(
    prompt.reviews,
    prompt.mtUzbekPrompt,
    prompt.canonicalUzbekPrompt,
    reviewTarget,
  );
  const intentEnabled =
    prompt.dataset.settings.intentCheckEnabled && prompt.requiredIntentChecks > 0;
  const intentMatchUpdates = intentEnabled
    ? prompt.intentChecks.filter((intentCheck) => {
        const computed = compareIntentText(prompt.intendedIntent, intentCheck.recoveredIntent);
        return intentCheck.matchStatus !== computed;
      })
    : [];

  for (const intentCheck of intentMatchUpdates) {
    await tx.intentCheck.update({
      where: { id: intentCheck.id },
      data: {
        matchStatus: compareIntentText(prompt.intendedIntent, intentCheck.recoveredIntent),
      },
    });
  }

  const refreshedPrompt =
    intentMatchUpdates.length > 0 ? await getPromptWorkflow(tx, promptId) : prompt;

  if (!refreshedPrompt || !refreshedPrompt.dataset.settings) {
    throw new Error("Prompt could not be refreshed.");
  }

  const intentSummary = intentEnabled
    ? buildIntentSummary(refreshedPrompt.intendedIntent, refreshedPrompt.intentChecks)
    : getIntentFallbackSummary();
  const state = computePromptState({
    prompt: {
      id: refreshedPrompt.id,
      status: refreshedPrompt.status,
      requiredReviews: refreshedPrompt.requiredReviews,
      requiredIntentChecks: refreshedPrompt.requiredIntentChecks,
      intendedIntent: refreshedPrompt.intendedIntent,
      canonicalUzbekPrompt: refreshedPrompt.canonicalUzbekPrompt,
      manualSpotCheckRequested: refreshedPrompt.manualSpotCheckRequested,
      extraReviewRequested: refreshedPrompt.extraReviewRequested,
      randomSpotCheckSelected: refreshedPrompt.randomSpotCheckSelected,
      finalDecision: refreshedPrompt.finalDecision,
      completedReviewAssignments: refreshedPrompt.reviews.length,
      openReviewAssignments: countOpenAssignments(refreshedPrompt.assignments, TaskType.REVIEW),
      completedIntentAssignments: refreshedPrompt.intentChecks.length,
      openIntentAssignments: countOpenAssignments(
        refreshedPrompt.assignments,
        TaskType.INTENT_CHECK,
      ),
      spotChecks: refreshedPrompt.spotChecks.map((spotCheck) => ({ action: spotCheck.action })),
    },
    settings: refreshedPrompt.dataset.settings,
    reviewSummary,
    intentSummary,
    canonicalDecision,
  });

  const previousStatus = refreshedPrompt.status;
  const nextStatus = state.status;

  await tx.prompt.update({
    where: { id: refreshedPrompt.id },
    data: {
      status: nextStatus,
      finalDecision: state.finalDecision,
      canonicalUzbekPrompt: canonicalDecision.canonicalUzbekPrompt,
      needsCanonicalSelection: canonicalDecision.needsCanonicalSelection,
      intentMatchStatus: intentEnabled ? intentSummary.aggregateStatus : null,
      randomSpotCheckSelected: state.randomSpotCheckSelected,
      spotCheckRequired: state.spotCheckRequired,
      lowConfidenceFlag: intentEnabled ? intentSummary.lowConfidence : false,
      mismatchFlag:
        intentEnabled &&
        (intentSummary.aggregateStatus === IntentMatchStatus.MISMATCH ||
          intentSummary.aggregateStatus === IntentMatchStatus.MANUAL_CHECK_NEEDED),
      notSureFlag: reviewSummary.hasNotSure,
      disagreementFlag: reviewSummary.disagreement || (intentEnabled && intentSummary.disagreement),
      escalationReasons: JSON.stringify(state.escalationReasons),
      reviewSummary: JSON.stringify(reviewSummary),
      intentCheckSummary: intentEnabled ? JSON.stringify(intentSummary) : null,
      lastReviewedAt: refreshedPrompt.reviews.at(-1)?.createdAt ?? null,
      lastIntentCheckedAt: intentEnabled
        ? refreshedPrompt.intentChecks.at(-1)?.createdAt ?? null
        : null,
      finalizedAt: state.finalDecision ? new Date() : null,
      extraReviewRequested:
        nextStatus === PromptStatus.PENDING_REVIEW || nextStatus === PromptStatus.IN_REVIEW
          ? refreshedPrompt.extraReviewRequested
          : false,
    },
  });

  if (previousStatus !== nextStatus) {
    await addAuditLog(tx, {
      datasetId: refreshedPrompt.datasetId,
      promptId: refreshedPrompt.id,
      actorId,
      action: "prompt_status_changed",
      fromStatus: previousStatus,
      toStatus: nextStatus,
      metadata: {
        escalationReasons: state.escalationReasons,
      },
    });
  }

  return state;
}

export async function assignPromptToUser(input: {
  promptId: string;
  userId: string;
  taskType: TaskType;
  actorId: string;
  notes?: string;
  overrideLimit?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    const prompt = await tx.prompt.findUnique({
      where: { id: input.promptId },
      include: {
        dataset: {
          include: {
            settings: true,
          },
        },
        assignments: true,
        reviews: true,
        intentChecks: true,
      },
    });

    const user = await tx.user.findUnique({
      where: { id: input.userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!prompt || !prompt.dataset.settings || !user || !user.isActive) {
      throw new Error("Prompt, user, or settings not found.");
    }

    const overrideLimit = input.overrideLimit ?? false;
    const reviewTarget = prompt.requiredReviews + (prompt.extraReviewRequested ? 1 : 0);
    const reviewDecision = chooseCanonicalUzbek(
      prompt.reviews,
      prompt.mtUzbekPrompt,
      prompt.canonicalUzbekPrompt,
      reviewTarget,
    );
    const intentCount = prompt.intentChecks.length;
    const openReviewAssignments = countOpenAssignments(prompt.assignments, TaskType.REVIEW);

    if (
      input.taskType === TaskType.INTENT_CHECK &&
      !prompt.dataset.settings.intentCheckEnabled &&
      !overrideLimit
    ) {
      throw new Error("Intent checking is currently disabled for this dataset.");
    }

    if (
      input.taskType === TaskType.SPOT_CHECK &&
      !prompt.dataset.settings.spotCheckEnabled &&
      !overrideLimit
    ) {
      throw new Error("Spot checking is currently disabled for this dataset.");
    }

    const requiredRole = TASK_ROLE_MAP[input.taskType];
    if (!user.roles.some((entry) => entry.role.name === requiredRole)) {
      throw new Error("User does not have the required role.");
    }

    if (
      prompt.assignments.some(
        (assignment) =>
          assignment.userId === input.userId && assignment.taskType === input.taskType,
      )
    ) {
      throw new Error("This user has already seen this prompt for that task.");
    }

    if (
      input.taskType === TaskType.REVIEW &&
      (prompt.intentChecks.some((item) => item.intentCheckerId === input.userId) ||
        prompt.assignments.some(
          (assignment) =>
            assignment.userId === input.userId && assignment.taskType === TaskType.INTENT_CHECK,
        ))
    ) {
      throw new Error("The same user cannot review and intent-check the same prompt.");
    }

    if (
      input.taskType === TaskType.INTENT_CHECK &&
      (prompt.reviews.some((item) => item.reviewerId === input.userId) ||
        prompt.assignments.some(
          (assignment) =>
            assignment.userId === input.userId && assignment.taskType === TaskType.REVIEW,
        ))
    ) {
      throw new Error("The same user cannot review and intent-check the same prompt.");
    }

    if (input.taskType === TaskType.REVIEW && openReviewAssignments > 0 && !overrideLimit) {
      throw new Error("This prompt already has an active review assignment.");
    }

    if (
      input.taskType === TaskType.REVIEW &&
      reviewDecision.reviewTargetReached &&
      !overrideLimit
    ) {
      throw new Error("Required review count has already been reached.");
    }

    if (
      input.taskType === TaskType.INTENT_CHECK &&
      (intentCount >= prompt.requiredIntentChecks ||
        !reviewDecision.reviewTargetReached ||
        !reviewDecision.canonicalUzbekPrompt ||
        reviewDecision.needsCanonicalSelection) &&
      !overrideLimit
    ) {
      throw new Error("This prompt is not eligible for intent checking.");
    }

    if (
      input.taskType === TaskType.SPOT_CHECK &&
      prompt.status !== PromptStatus.PENDING_SPOT_CHECK &&
      !overrideLimit
    ) {
      throw new Error("Spot checks can only be assigned when the prompt is pending spot check.");
    }

    const assignment = await tx.assignment.create({
      data: {
        promptId: prompt.id,
        userId: input.userId,
        taskType: input.taskType,
        overrideLimit,
        notes: input.notes,
        assignedById: input.actorId,
      },
    });

    await addAuditLog(tx, {
      datasetId: prompt.datasetId,
      promptId: prompt.id,
      actorId: input.actorId,
      action: "assignment_created",
      taskType: input.taskType,
      metadata: {
        assignedUserId: input.userId,
        overrideLimit,
      },
    });

    await recomputePromptState(tx, prompt.id, input.actorId);

    return assignment;
  });
}

export async function autoAssignPrompts(input: {
  datasetId: string;
  userId: string;
  taskType: TaskType;
  count: number;
  actorId: string;
  overrideLimit?: boolean;
}) {
  const prompts = await prisma.prompt.findMany({
    where: { datasetId: input.datasetId },
    include: {
      dataset: {
        include: {
          settings: true,
        },
      },
      assignments: true,
      reviews: true,
      intentChecks: true,
      spotChecks: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const candidates = prompts.filter((prompt) => {
    if (!prompt.dataset.settings) {
      return false;
    }

    const reviewTarget = prompt.requiredReviews + (prompt.extraReviewRequested ? 1 : 0);
    const reviewDecision = chooseCanonicalUzbek(
      prompt.reviews,
      prompt.mtUzbekPrompt,
      prompt.canonicalUzbekPrompt,
      reviewTarget,
    );

    if (
      prompt.assignments.some(
        (assignment) =>
          assignment.userId === input.userId && assignment.taskType === input.taskType,
      )
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.REVIEW &&
      countOpenAssignments(prompt.assignments, TaskType.REVIEW) > 0 &&
      !input.overrideLimit
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.REVIEW &&
      reviewDecision.reviewTargetReached &&
      !input.overrideLimit
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.INTENT_CHECK &&
      !prompt.dataset.settings.intentCheckEnabled &&
      !input.overrideLimit
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.INTENT_CHECK &&
      ((!reviewDecision.reviewTargetReached ||
        !reviewDecision.canonicalUzbekPrompt ||
        reviewDecision.needsCanonicalSelection ||
        prompt.intentChecks.length >= prompt.requiredIntentChecks) &&
        !input.overrideLimit)
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.SPOT_CHECK &&
      !prompt.dataset.settings.spotCheckEnabled &&
      !input.overrideLimit
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.SPOT_CHECK &&
      prompt.status !== PromptStatus.PENDING_SPOT_CHECK &&
      !input.overrideLimit
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.REVIEW &&
      (prompt.intentChecks.some((check) => check.intentCheckerId === input.userId) ||
        prompt.assignments.some(
          (assignment) =>
            assignment.userId === input.userId && assignment.taskType === TaskType.INTENT_CHECK,
        ))
    ) {
      return false;
    }

    if (
      input.taskType === TaskType.INTENT_CHECK &&
      (prompt.reviews.some((review) => review.reviewerId === input.userId) ||
        prompt.assignments.some(
          (assignment) =>
            assignment.userId === input.userId && assignment.taskType === TaskType.REVIEW,
        ))
    ) {
      return false;
    }

    return true;
  });

  const sorted = [...candidates].sort((left, right) => {
    const leftTouched = left.assignments.some((assignment) => assignment.userId === input.userId);
    const rightTouched = right.assignments.some(
      (assignment) => assignment.userId === input.userId,
    );

    if (leftTouched === rightTouched) {
      return Math.random() > 0.5 ? 1 : -1;
    }

    return Number(leftTouched) - Number(rightTouched);
  });

  const selected = sorted.slice(0, input.count);

  for (const prompt of selected) {
    await assignPromptToUser({
      promptId: prompt.id,
      userId: input.userId,
      taskType: input.taskType,
      actorId: input.actorId,
      overrideLimit: input.overrideLimit,
    });
  }

  return selected.length;
}

export function roleForTask(taskType: TaskType): RoleName {
  return TASK_ROLE_MAP[taskType];
}

import { RoleName } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildExportWorkbook } from "@/lib/xlsx";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!session.user.roles.includes(RoleName.ADMIN)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const datasetId = url.searchParams.get("datasetId");

  if (!datasetId) {
    return new Response("datasetId is required", { status: 400 });
  }

  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
    include: {
      prompts: {
        include: {
          reviews: {
            include: {
              reviewer: true,
            },
            orderBy: { createdAt: "asc" },
          },
          intentChecks: {
            include: {
              intentChecker: true,
            },
            orderBy: { createdAt: "asc" },
          },
          spotChecks: {
            include: {
              spotChecker: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!dataset) {
    return new Response("Dataset not found", { status: 404 });
  }

  const workbook = buildExportWorkbook({
    name: dataset.name,
    prompts: dataset.prompts.map((prompt) => ({
      promptId: prompt.promptId,
      category: prompt.category,
      englishPrompt: prompt.englishPrompt,
      mtUzbekPrompt: prompt.mtUzbekPrompt,
      canonicalUzbekPrompt: prompt.canonicalUzbekPrompt,
      intendedIntent: prompt.intendedIntent,
      status: prompt.status,
      finalDecision: prompt.finalDecision,
      intentMatchStatus: prompt.intentMatchStatus,
      lowConfidenceFlag: prompt.lowConfidenceFlag,
      mismatchFlag: prompt.mismatchFlag,
      notSureFlag: prompt.notSureFlag,
      createdAt: prompt.createdAt,
      updatedAt: prompt.updatedAt,
      reviews: prompt.reviews.map((review) => ({
        reviewerId: review.reviewerId,
        reviewerEmail: review.reviewer.email,
        originalMtUzbekPrompt: review.originalMtUzbekPrompt,
        translationChoice: review.translationChoice,
        editedUzbekPrompt: review.editedUzbekPrompt,
        intentMatchesOriginal: review.intentMatchesOriginal,
        harmCategoryMatches: review.harmCategoryMatches,
        strengthOfRequest: review.strengthOfRequest,
        meaningClarity: review.meaningClarity,
        naturalness: review.naturalness,
        meaningDrift: review.meaningDrift,
        finalDecision: review.finalDecision,
        notes: review.notes,
        createdAt: review.createdAt,
      })),
      intentChecks: prompt.intentChecks.map((check) => ({
        intentCheckerId: check.intentCheckerId,
        intentCheckerEmail: check.intentChecker.email,
        recoveredIntent: check.recoveredIntent,
        categoryGuess: check.categoryGuess,
        confidence: check.confidence,
        matchStatus: check.matchStatus,
        createdAt: check.createdAt,
      })),
      spotChecks: prompt.spotChecks.map((spotCheck) => ({
        spotCheckerId: spotCheck.spotCheckerId,
        spotCheckerEmail: spotCheck.spotChecker.email,
        action: spotCheck.action,
        notes: spotCheck.notes,
        createdAt: spotCheck.createdAt,
      })),
    })),
  });

  return new Response(workbook, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${dataset.name.replace(/\s+/g, "_")}_export.xlsx"`,
    },
  });
}

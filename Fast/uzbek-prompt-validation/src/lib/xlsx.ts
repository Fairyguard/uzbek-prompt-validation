import * as XLSX from "xlsx";
import { IntentMatchStatus } from "@prisma/client";

export const REQUIRED_IMPORT_COLUMNS = [
  "prompt_id",
  "category",
  "english_prompt",
  "mt_uzbek_prompt",
] as const;

export type ImportedPromptRow = {
  prompt_id: string;
  category: string;
  english_prompt: string;
  mt_uzbek_prompt: string;
  intended_intent?: string;
  notes?: string;
};

export function parsePromptWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("The workbook must contain at least one sheet.");
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
  });

  if (rows.length === 0) {
    throw new Error("The workbook is empty.");
  }

  const headerKeys = Object.keys(rows[0] ?? {});
  const missing = REQUIRED_IMPORT_COLUMNS.filter((column) => !headerKeys.includes(column));

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }

  return rows.map((row, index) => {
    const normalized = {
      prompt_id: String(row.prompt_id ?? "").trim(),
      category: String(row.category ?? "").trim(),
      english_prompt: String(row.english_prompt ?? "").trim(),
      mt_uzbek_prompt: String(row.mt_uzbek_prompt ?? "").trim(),
      intended_intent: String(row.intended_intent ?? "").trim(),
      notes: String(row.notes ?? "").trim(),
    };

    if (
      !normalized.prompt_id ||
      !normalized.category ||
      !normalized.english_prompt ||
      !normalized.mt_uzbek_prompt
    ) {
      throw new Error(`Row ${index + 2} is missing one or more required values.`);
    }

    return normalized satisfies ImportedPromptRow;
  });
}

type ExportDataset = {
  name: string;
  prompts: Array<{
    promptId: string;
    category: string;
    englishPrompt: string;
    mtUzbekPrompt: string;
    canonicalUzbekPrompt: string | null;
    intendedIntent: string | null;
    status: string;
    finalDecision: string | null;
    intentMatchStatus: IntentMatchStatus | null;
    lowConfidenceFlag: boolean;
    mismatchFlag: boolean;
    notSureFlag: boolean;
    createdAt: Date;
    updatedAt: Date;
    reviews: Array<{
      reviewerId: string;
      reviewerEmail: string;
      originalMtUzbekPrompt: string;
      editedUzbekPrompt: string;
      intentMatchesOriginal: string;
      harmCategoryMatches: string;
      strengthOfRequest: string;
      meaningClarity: string;
      naturalness: string;
      meaningDrift: string;
      finalDecision: string;
      notes: string | null;
      createdAt: Date;
    }>;
    intentChecks: Array<{
      intentCheckerId: string;
      intentCheckerEmail: string;
      recoveredIntent: string;
      categoryGuess: string | null;
      confidence: string;
      matchStatus: string | null;
      createdAt: Date;
    }>;
    spotChecks: Array<{
      spotCheckerId: string;
      spotCheckerEmail: string;
      action: string;
      notes: string | null;
      createdAt: Date;
    }>;
  }>;
};

export function buildExportWorkbook(dataset: ExportDataset) {
  const workbook = XLSX.utils.book_new();

  const promptSummary = dataset.prompts.map((prompt) => ({
    prompt_id: prompt.promptId,
    category: prompt.category,
    english_prompt: prompt.englishPrompt,
    mt_uzbek_prompt: prompt.mtUzbekPrompt,
    final_uzbek_prompt: prompt.canonicalUzbekPrompt ?? "",
    intended_intent: prompt.intendedIntent ?? "",
    intent_match_status: prompt.intentMatchStatus ?? "",
    status: prompt.status,
    final_status: prompt.finalDecision ?? "",
    not_sure_case: prompt.notSureFlag ? "yes" : "no",
    mismatch_case: prompt.mismatchFlag ? "yes" : "no",
    low_confidence_case: prompt.lowConfidenceFlag ? "yes" : "no",
    created_at: prompt.createdAt.toISOString(),
    updated_at: prompt.updatedAt.toISOString(),
  }));

  const reviewRows = dataset.prompts.flatMap((prompt) =>
    prompt.reviews.map((review) => ({
      prompt_id: prompt.promptId,
      category: prompt.category,
      english_prompt: prompt.englishPrompt,
      mt_uzbek_prompt: prompt.mtUzbekPrompt,
      edited_uzbek_prompt: review.editedUzbekPrompt,
      reviewer_id: review.reviewerId,
      reviewer_email: review.reviewerEmail,
      intent_matches_original: review.intentMatchesOriginal,
      harm_category_matches: review.harmCategoryMatches,
      strength_of_request: review.strengthOfRequest,
      meaning_clarity: review.meaningClarity,
      naturalness: review.naturalness,
      meaning_drift: review.meaningDrift,
      reviewer_decision: review.finalDecision,
      reviewer_notes: review.notes ?? "",
      timestamp: review.createdAt.toISOString(),
    })),
  );

  const intentRows = dataset.prompts.flatMap((prompt) =>
    prompt.intentChecks.map((check) => ({
      prompt_id: prompt.promptId,
      category: prompt.category,
      final_uzbek_prompt: prompt.canonicalUzbekPrompt ?? "",
      intent_checker_id: check.intentCheckerId,
      intent_checker_email: check.intentCheckerEmail,
      recovered_intent: check.recoveredIntent,
      category_guess: check.categoryGuess ?? "",
      intent_confidence: check.confidence,
      intended_intent: prompt.intendedIntent ?? "",
      intent_match_status: check.matchStatus ?? prompt.intentMatchStatus ?? "",
      timestamp: check.createdAt.toISOString(),
    })),
  );

  const spotRows = dataset.prompts.flatMap((prompt) =>
    prompt.spotChecks.map((spotCheck) => ({
      prompt_id: prompt.promptId,
      category: prompt.category,
      english_prompt: prompt.englishPrompt,
      final_uzbek_prompt: prompt.canonicalUzbekPrompt ?? "",
      intended_intent: prompt.intendedIntent ?? "",
      spot_checker_id: spotCheck.spotCheckerId,
      spot_checker_email: spotCheck.spotCheckerEmail,
      spot_check_result: spotCheck.action,
      spot_check_notes: spotCheck.notes ?? "",
      final_status: prompt.finalDecision ?? "",
      timestamp: spotCheck.createdAt.toISOString(),
    })),
  );

  const flatRows = dataset.prompts.flatMap((prompt) => {
    const reviewAnnotations = prompt.reviews.map((review) => ({
      annotation_type: "review",
      prompt_id: prompt.promptId,
      category: prompt.category,
      english_prompt: prompt.englishPrompt,
      mt_uzbek_prompt: prompt.mtUzbekPrompt,
      edited_uzbek_prompt: review.editedUzbekPrompt,
      reviewer_id: review.reviewerId,
      reviewer_notes: review.notes ?? "",
      reviewer_decision: review.finalDecision,
      review_intent_matches_original: review.intentMatchesOriginal,
      review_harm_category_matches: review.harmCategoryMatches,
      review_strength_of_request: review.strengthOfRequest,
      review_meaning_clarity: review.meaningClarity,
      review_naturalness: review.naturalness,
      review_meaning_drift: review.meaningDrift,
      intent_checker_id: "",
      recovered_intent: "",
      category_guess: "",
      intent_confidence: "",
      intended_intent: prompt.intendedIntent ?? "",
      intent_match_status: prompt.intentMatchStatus ?? "",
      spot_checker_id: "",
      spot_check_result: "",
      final_status: prompt.finalDecision ?? "",
      timestamp: review.createdAt.toISOString(),
    }));

    const intentAnnotations = prompt.intentChecks.map((check) => ({
      annotation_type: "intent_check",
      prompt_id: prompt.promptId,
      category: prompt.category,
      english_prompt: prompt.englishPrompt,
      mt_uzbek_prompt: prompt.mtUzbekPrompt,
      edited_uzbek_prompt: prompt.canonicalUzbekPrompt ?? "",
      reviewer_id: "",
      reviewer_notes: "",
      reviewer_decision: "",
      review_intent_matches_original: "",
      review_harm_category_matches: "",
      review_strength_of_request: "",
      review_meaning_clarity: "",
      review_naturalness: "",
      review_meaning_drift: "",
      intent_checker_id: check.intentCheckerId,
      recovered_intent: check.recoveredIntent,
      category_guess: check.categoryGuess ?? "",
      intent_confidence: check.confidence,
      intended_intent: prompt.intendedIntent ?? "",
      intent_match_status: check.matchStatus ?? prompt.intentMatchStatus ?? "",
      spot_checker_id: "",
      spot_check_result: "",
      final_status: prompt.finalDecision ?? "",
      timestamp: check.createdAt.toISOString(),
    }));

    const spotAnnotations = prompt.spotChecks.map((spotCheck) => ({
      annotation_type: "spot_check",
      prompt_id: prompt.promptId,
      category: prompt.category,
      english_prompt: prompt.englishPrompt,
      mt_uzbek_prompt: prompt.mtUzbekPrompt,
      edited_uzbek_prompt: prompt.canonicalUzbekPrompt ?? "",
      reviewer_id: "",
      reviewer_notes: "",
      reviewer_decision: "",
      review_intent_matches_original: "",
      review_harm_category_matches: "",
      review_strength_of_request: "",
      review_meaning_clarity: "",
      review_naturalness: "",
      review_meaning_drift: "",
      intent_checker_id: "",
      recovered_intent: "",
      category_guess: "",
      intent_confidence: "",
      intended_intent: prompt.intendedIntent ?? "",
      intent_match_status: prompt.intentMatchStatus ?? "",
      spot_checker_id: spotCheck.spotCheckerId,
      spot_check_result: spotCheck.action,
      final_status: prompt.finalDecision ?? "",
      timestamp: spotCheck.createdAt.toISOString(),
    }));

    return [...reviewAnnotations, ...intentAnnotations, ...spotAnnotations];
  });

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(promptSummary),
    "prompt_summary",
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(reviewRows), "reviews");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(intentRows), "intent_checks");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(spotRows), "spot_checks");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(flatRows),
    "flat_annotations",
  );

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

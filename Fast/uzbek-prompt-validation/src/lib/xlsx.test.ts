import * as XLSX from "xlsx";
import { buildExportWorkbook, parsePromptWorkbook } from "@/lib/xlsx";

describe("xlsx helpers", () => {
  it("parses required import columns", () => {
    const sheet = XLSX.utils.json_to_sheet([
      {
        prompt_id: "p-1",
        category: "demo",
        english_prompt: "English",
        mt_uzbek_prompt: "Uzbek",
        intended_intent: "Intent",
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");

    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const rows = parsePromptWorkbook(buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.prompt_id).toBe("p-1");
  });

  it("builds a workbook with normalized sheets", () => {
    const buffer = buildExportWorkbook({
      name: "Demo",
      prompts: [
        {
          promptId: "p-1",
          category: "demo",
          englishPrompt: "English",
          mtUzbekPrompt: "Uzbek mt",
          canonicalUzbekPrompt: "Uzbek final",
          intendedIntent: "Intent",
          status: "APPROVED",
          finalDecision: "APPROVED",
          intentMatchStatus: "MATCH",
          lowConfidenceFlag: false,
          mismatchFlag: false,
          notSureFlag: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          reviews: [],
          intentChecks: [],
          spotChecks: [],
        },
      ],
    });

    const workbook = XLSX.read(buffer, { type: "buffer" });

    expect(workbook.SheetNames).toContain("prompt_summary");
    expect(workbook.SheetNames).toContain("flat_annotations");
  });
});

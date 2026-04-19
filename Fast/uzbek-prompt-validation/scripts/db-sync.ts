import path from "node:path";
import { PrismaClient, ReviewTranslationChoice } from "@prisma/client";
import { loadEnvFile, syncSqliteSchema } from "./sqlite-bootstrap";

function normalizeComparableText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  const result = syncSqliteSchema(databaseUrl);
  const prisma = new PrismaClient();

  try {
    const reviewsNeedingInference = await prisma.review.findMany({
      where: {
        translationChoice: ReviewTranslationChoice.KEEP_MT,
      },
      select: {
        id: true,
        originalMtUzbekPrompt: true,
        editedUzbekPrompt: true,
      },
    });

    for (const review of reviewsNeedingInference) {
      if (
        normalizeComparableText(review.originalMtUzbekPrompt) !==
        normalizeComparableText(review.editedUzbekPrompt)
      ) {
        await prisma.review.update({
          where: { id: review.id },
          data: {
            translationChoice: ReviewTranslationChoice.EDIT_TRANSLATION,
          },
        });
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `${result.changed ? "SQLite schema synced" : "SQLite schema already up to date"} at ${result.sqlitePath}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

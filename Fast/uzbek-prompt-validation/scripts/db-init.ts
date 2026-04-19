import fs from "node:fs";
import path from "node:path";
import {
  bootstrapSqliteSchema,
  loadEnvFile,
  resolveSqlitePath,
} from "./sqlite-bootstrap";

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is missing.");
  }

  const sqlitePath = resolveSqlitePath(databaseUrl);

  if (fs.existsSync(sqlitePath)) {
    console.log(`SQLite database already exists at ${sqlitePath}`);
    return;
  }

  bootstrapSqliteSchema(sqlitePath);
  console.log(`SQLite schema initialized at ${sqlitePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import path from "node:path";
import fs from "node:fs";
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
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  if (fs.existsSync(sqlitePath)) {
    fs.rmSync(sqlitePath, { force: true });
  }

  bootstrapSqliteSchema(sqlitePath);

  console.log(`SQLite schema created at ${sqlitePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

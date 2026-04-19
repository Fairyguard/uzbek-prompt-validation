import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^"(.*)"$/, "$1");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function resolveSqlitePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("The SQLite bootstrap script only supports file: DATABASE_URL values.");
  }

  const sqliteTarget = databaseUrl.replace(/^file:/, "");

  if (!sqliteTarget) {
    throw new Error("DATABASE_URL must point to a SQLite file.");
  }

  if (path.isAbsolute(sqliteTarget)) {
    return sqliteTarget;
  }

  return path.resolve(process.cwd(), "prisma", sqliteTarget);
}

export function runPrisma(args: string[]) {
  const prismaEntrypoint = path.join(
    process.cwd(),
    "node_modules",
    "prisma",
    "build",
    "index.js",
  );

  const result = spawnSync(process.execPath, [prismaEntrypoint, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Prisma command failed: ${args.join(" ")}`);
  }

  return result.stdout;
}

export function bootstrapSqliteSchema(sqlitePath: string) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const sql = runPrisma([
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--script",
  ]);

  const tempFile = path.join(os.tmpdir(), `uzbek-prompt-validation-${Date.now()}.sql`);
  fs.writeFileSync(tempFile, sql, "utf8");

  try {
    runPrisma(["db", "execute", "--file", tempFile, "--schema", "prisma/schema.prisma"]);
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
}

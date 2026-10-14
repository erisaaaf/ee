import "server-only";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

function resolveSqliteUrl(raw: string | undefined): string {
  const url = raw ?? "file:./prisma/dev.db";
  if (!url.startsWith("file:")) return url;
  const file = url.slice("file:".length);
  if (file === ":memory:" || path.isAbsolute(file)) return file;
  return path.resolve(process.cwd(), file);
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: resolveSqliteUrl(process.env.DATABASE_URL) });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

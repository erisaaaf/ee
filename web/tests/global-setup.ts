import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

// Fresh test database for every run: apply real migrations, then the real seed.
export default function setup() {
  const root = path.resolve(import.meta.dirname, "..");
  const dbFile = path.join(root, "prisma", "test.db");
  for (const f of [dbFile, `${dbFile}-journal`]) if (existsSync(f)) rmSync(f);
  const env = { ...process.env, DATABASE_URL: "file:./prisma/test.db" };
  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { cwd: root, env, stdio: "pipe" });
}

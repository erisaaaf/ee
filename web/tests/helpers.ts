import { randomUUID } from "node:crypto";
import { registerUser } from "@/server/services/auth";

export async function makeUser(overrides: Partial<{ email: string; password: string; name: string }> = {}) {
  const email = overrides.email ?? `user-${randomUUID().slice(0, 8)}@example.test`;
  const password = overrides.password ?? "correct horse 42";
  const user = await registerUser({ email, password, name: overrides.name ?? "Test User", timezone: "Europe/Tirane" });
  return { user, email, password };
}

export const cid = () => randomUUID();

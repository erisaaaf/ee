// End-to-end API journey against a running server.
// Usage: node tests/e2e/api-journey.mjs http://localhost:3000
// Creates a throwaway account, exercises every major workflow over HTTP, then deletes the account.
const BASE = process.argv[2] ?? "http://localhost:3000";
let cookie = "";
let passed = 0;
const failures = [];

async function call(method, path, body, { expect = [200, 201, 204], raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Origin: BASE, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const [name, value] = pair.split("=");
    if (name === "vt_session") cookie = value ? `vt_session=${value}` : "";
  }
  const text = await res.text();
  const json = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return raw ? { status: res.status, json, headers: res.headers } : json?.data ?? json;
}

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const today = new Date().toISOString().slice(0, 10);
const email = `e2e-${Date.now()}@example.test`;
const password = "journey-pass-123";
const ctx = {};

console.log(`API journey against ${BASE}`);

await step("register, session cookie set", async () => {
  await call("POST", "/api/auth/register", { email, password, name: "E2E", timezone: "UTC" });
  assert(cookie, "no session cookie");
});
await step("onboarding: profile → estimated targets", async () => {
  await call("PATCH", "/api/me/profile", { birthYear: 1994, sex: "female", heightCm: 168, weightKg: 62, activityLevel: "moderate", units: "metric", timezone: "UTC" });
  await call("PATCH", "/api/me/preferences", { goals: ["strength", "hydration"], allergies: ["peanuts"], equipment: ["dumbbells"], dietPattern: "balanced" });
  const me = await call("POST", "/api/me/onboarding");
  assert(me.profile.onboardingComplete, "onboarding not complete");
  assert(me.targets.calorieTarget > 1500 && me.targets.calorieTarget < 3000, `odd calorie target ${me.targets.calorieTarget}`);
});
await step("food search incl. Albanian name", async () => {
  const r = await call("GET", "/api/foods?q=qepe");
  assert(r[0]?.name === "Onion, raw", `got ${r[0]?.name}`);
  ctx.apple = (await call("GET", "/api/foods?q=apple"))[0];
});
await step("log food → diary totals; edit; delete", async () => {
  const e = await call("POST", "/api/diary", { kind: "food", foodId: ctx.apple.id, grams: 200, quantity: 1, unitLabel: "g", date: today, mealType: "snack", source: "search", clientId: crypto.randomUUID() });
  let d = await call("GET", `/api/diary?date=${today}`);
  assert(d.totals.values.kcal === 104, `kcal ${d.totals.values.kcal}`);
  await call("PATCH", `/api/diary/${e.id}`, { grams: 100 });
  d = await call("GET", `/api/diary?date=${today}`);
  assert(d.totals.values.kcal === 52, `after edit ${d.totals.values.kcal}`);
  await call("DELETE", `/api/diary/${e.id}`);
  d = await call("GET", `/api/diary?date=${today}`);
  assert(d.entryCount === 0, "not deleted");
});
await step("barcode lookup (live Open Food Facts) + invalid + QR URL", async () => {
  const r = await call("POST", "/api/foods/barcode", { code: "3017624010701" });
  assert(r.status === "found" || r.status === "not_found", `status ${r.status}`);
  if (r.status === "found") assert(r.food.per100.kcal > 400, "implausible kcal");
  assert((await call("POST", "/api/foods/barcode", { code: "3017624010700" })).status === "invalid", "invalid not detected");
  assert((await call("POST", "/api/foods/barcode", { code: "https://example.com" })).status === "not_food_code", "QR url");
});
await step("custom food + recipe + log a serving", async () => {
  const f = await call("POST", "/api/foods/custom", { name: "E2E bar", servingG: 50, servingLabel: "1 bar", basis: "perServing", kcal: 200, proteinG: 10, carbsG: 20, fatG: 8 });
  assert(f.per100.kcal === 400, "per100 conversion");
  const r = await call("POST", "/api/recipes", { name: "E2E bowl", servings: 2, ingredients: [{ foodId: ctx.apple.id, name: "Apple", grams: 200, quantity: 1, unitLabel: "g" }, { foodId: f.id, name: "Bar", grams: 100, quantity: 1, unitLabel: "g" }] });
  assert(r.nutrition.perServing.kcal === Math.round((104 + 400) / 2), `per serving ${r.nutrition.perServing.kcal}`);
  const e = await call("POST", "/api/diary", { kind: "recipe", recipeId: r.id, servings: 1, date: today, mealType: "lunch" });
  assert(Math.abs(e.totals.kcal - 252) <= 1, `recipe entry ${e.totals.kcal}`);
});
await step("water: add idempotently, undo", async () => {
  const clientId = crypto.randomUUID();
  const w = await call("POST", "/api/water", { date: today, amountMl: 250, clientId });
  await call("POST", "/api/water", { date: today, amountMl: 250, clientId });
  let day = await call("GET", `/api/water?date=${today}`);
  assert(day.totalMl === 250, `total ${day.totalMl}`);
  await call("DELETE", `/api/water/${w.id}`);
  day = await call("GET", `/api/water?date=${today}`);
  assert(day.totalMl === 0, "undo failed");
});
await step("workout: generate → save plan → session → finish", async () => {
  const g = await call("POST", "/api/workouts/generate", { minutes: 30, location: "home", goal: "strength", focus: "full", seed: 1 });
  assert(g.items.length > 0, "empty plan");
  const t = await call("POST", "/api/workouts/templates", { name: g.name, location: "home", source: "generator", scheduledDays: [], items: g.items.map((i) => ({ exerciseId: i.exerciseId, sets: i.sets, reps: i.reps, durationSec: i.durationSec, restSec: i.restSec })) });
  let s = await call("POST", "/api/workouts/sessions", { templateId: t.id, date: today, clientId: crypto.randomUUID() });
  s = await call("PATCH", `/api/workouts/sessions/${s.id}/sets/${s.sets[0].id}`, { completed: true, reps: 10 });
  const fin = await call("POST", `/api/workouts/sessions/${s.id}/finish`, { effort: 6 });
  assert(fin.session.status === "completed", "not completed");
  const hist = await call("GET", "/api/workouts/sessions");
  assert(hist.some((h) => h.id === s.id), "not in history");
});
await step("sports: manual + GPS (server-computed distance)", async () => {
  await call("POST", "/api/activities", { type: "football", date: today, durationMin: 60, intensity: "vigorous", source: "manual" });
  const route = Array.from({ length: 6 }, (_, i) => [42.66 + i * 0.0005, 21.16, Date.now() + i * 5000, null]);
  const a = await call("POST", "/api/activities", { type: "running", date: today, durationMin: 3, source: "gps", route, distanceM: 1 });
  assert(a.distanceM > 200 && a.distanceM < 300, `gps distance ${a.distanceM}`);
});
await step("sleep, wellbeing, steps", async () => {
  await call("POST", "/api/sleep", { date: today, bedtime: "23:15", wakeTime: "07:00", quality: 4 });
  await call("POST", "/api/wellbeing", { date: today, energy: 4, notes: "private note" });
  await call("PUT", "/api/steps", { date: today, steps: 8123 });
});
await step("goals, challenges, rewards", async () => {
  await call("POST", "/api/goals", { type: "water_daily", title: "Water", target: 2000, startDate: today });
  const goals = await call("GET", "/api/goals");
  assert(goals[0].percent === 0, "goal progress");
  await call("POST", "/api/challenges", { key: "hydration_7" });
  const r = await call("GET", "/api/rewards");
  assert(r.achievements.find((a) => a.key === "first_workout")?.earnedAt, "first_workout not earned");
  assert(!r.achievements.find((a) => a.key === "workouts_50")?.earnedAt, "unearned achievement awarded");
});
await step("dashboard & progress reflect the logged data", async () => {
  const d = await call("GET", "/api/dashboard");
  assert(d.steps.current === 8123, `steps ${d.steps.current}`);
  assert(d.workout.completed.length === 1, "workout not on dashboard");
  assert(d.sleep?.durationMin === 465, `sleep ${d.sleep?.durationMin}`);
  const p = await call("GET", `/api/progress?start=${today}&end=${today}`);
  assert(p.days[0].workouts === 1 && p.days[0].steps === 8123, "progress mismatch");
});
await step("global search", async () => {
  const s = await call("GET", "/api/search?q=E2E");
  assert(s.groups.some((g) => g.key === "recipes"), "recipe not found by search");
});
await step("AI: honest unavailable state when no key configured", async () => {
  const st = await call("GET", "/api/ai/status");
  if (!st.configured) {
    const r = await call("POST", "/api/ai/chat", { message: "hello" }, { expect: [503], raw: true });
    assert(r.json.error.code === "ai_not_configured", "wrong error code");
  }
});
await step("security: CSRF blocked, unauth rejected, other user's data invisible", async () => {
  const res = await fetch(BASE + "/api/water", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ date: today, amountMl: 100 }) });
  assert(res.status === 403, `csrf status ${res.status}`);
  const un = await fetch(BASE + "/api/diary");
  assert(un.status === 401, `unauth status ${un.status}`);
});
await step("export contains data and no secrets", async () => {
  const r = await call("GET", "/api/account/export", undefined, { raw: true });
  const text = JSON.stringify(r.json);
  assert(!text.includes("scrypt$"), "password hash leaked");
  assert(text.includes("private note"), "encrypted note not decrypted in export");
  assert(r.headers.get("content-disposition")?.includes("attachment"), "not an attachment");
});
await step("delete a data category", async () => {
  const inv = await call("DELETE", "/api/account/data", { category: "hydration", confirm: true });
  assert(inv.find((i) => i.key === "hydration").records === 0, "not deleted");
});
await step("logout → login again", async () => {
  await call("POST", "/api/auth/logout");
  await call("GET", "/api/me", undefined, { expect: [401] });
  await call("POST", "/api/auth/login", { email, password });
  await call("GET", "/api/me");
});
await step("delete account (cleanup)", async () => {
  await call("POST", "/api/account/delete", { password, confirm: "DELETE" });
  await call("POST", "/api/auth/login", { email, password }, { expect: [401] });
});

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);

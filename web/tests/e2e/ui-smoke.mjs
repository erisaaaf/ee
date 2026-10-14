// UI smoke test in a real browser (Chromium via Playwright).
// Usage: node tests/e2e/ui-smoke.mjs http://localhost:3000 <screenshot-dir>
// Registers through the real form, completes onboarding, logs food & water through the UI,
// visits every main screen at phone size, and fails on any uncaught page error or console error.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv[3] ?? "./test-results/screens";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const results = [];

async function run(name, fn) {
  try {
    await fn();
    results.push([name, true]);
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.log(`  ✗ ${name}\n      ${String(e.message).split("\n")[0]}`);
  }
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", locale: "en-GB", timezoneId: "Europe/Tirane" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(`pageerror on ${page.url()}: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (401|404)/.test(m.text())) errors.push(`console on ${page.url()}: ${m.text()}`);
});
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: true });

console.log(`UI smoke against ${BASE}`);
const email = `ui-${Date.now()}@example.test`;

await run("signed-out visitor is sent to login", async () => {
  await page.goto(BASE + "/");
  await page.waitForURL(/\/login/);
  await shot("01-login");
});
await run("register through the form", async () => {
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Name").fill("Erisa");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("uitest-pass-42");
  await shot("02-register");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
});
await run("onboarding steps", async () => {
  await page.getByLabel("Birth year").fill("1996");
  await page.getByLabel("Height (cm)").fill("168");
  await page.getByLabel("Weight (kg)").fill("60");
  await page.getByLabel("Daily activity").selectOption("moderate");
  await shot("03-onboarding-1");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Build strength" }).click();
  await page.getByRole("button", { name: "Improve hydration" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Dumbbells" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "peanuts" }).click();
  await shot("04-onboarding-food");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Finish" }).click();
  await page.waitForURL((u) => u.pathname === "/");
});
await run("home dashboard renders with estimated targets", async () => {
  await page.getByText("Today's overview").waitFor();
  await page.getByText("of ").first().waitFor();
  await shot("05-home");
});
await run("quick-add water from home updates the total", async () => {
  await page.getByRole("button", { name: /\+250 ml/ }).first().click();
  await page.getByText(/Added 250 ml/).waitFor();
});
await run("search and log a food (Albanian name)", async () => {
  await page.goto(BASE + "/nutrition/add?meal=breakfast");
  await page.getByLabel("Search foods").fill("byrek");
  await page.getByRole("button", { name: /Byrek me spinaq/ }).click();
  await page.getByRole("dialog").getByText(/typical recipe estimate/i).waitFor();
  await shot("06-log-sheet");
  await page.getByRole("button", { name: "Add to diary" }).click();
  await page.getByText(/Added .* to breakfast/).waitFor();
});
await run("diary shows the entry with an estimate badge", async () => {
  await page.goto(BASE + "/nutrition");
  await page.getByText("Byrek me spinaq (spinach & cheese burek)").waitFor();
  await page.getByText("Includes 1 estimate").waitFor();
  await shot("07-nutrition");
});
for (const [n, url, text] of [
  ["08-scan", "/nutrition/scan", "Start camera"],
  ["09-photo", "/nutrition/photo", "Take or choose a photo"],
  ["10-recipe-new", "/nutrition/recipes/new", "Ingredients"],
  ["11-plans", "/nutrition/plans", "Meal plans"],
  ["12-hydration", "/hydration", "Today's entries"],
  ["13-wellbeing", "/wellbeing", "Log sleep"],
  ["14-workout", "/workout", "Today's workout"],
  ["15-exercises", "/workout/exercises", "Exercise library"],
  ["16-generate", "/workout/generate", "Generate workout"],
  ["17-activity", "/activity", "Recent activities"],
  ["18-activity-new", "/activity/new?type=football", "Log an activity"],
  ["19-progress", "/progress", "Summary"],
  ["20-goals", "/progress/goals", "Goals"],
  ["21-rewards", "/progress/rewards", "Streaks"],
  ["22-coach", "/coach", "AI Coach"],
  ["23-settings", "/settings", "Privacy & data"],
  ["24-privacy", "/settings/privacy", "What we store"],
  ["25-devices", "/settings/devices", "Devices & imports"],
  ["26-security", "/settings/security", "Two-factor authentication"],
  ["27-targets", "/settings/targets", "Energy estimate"],
  ["28-search", "/search", "Search"],
]) {
  await run(`page ${url}`, async () => {
    await page.goto(BASE + url);
    // Match visible text only (the desktop sidebar is hidden at phone width but still in the DOM).
    await page.locator(`main :text("${text}")`).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    await shot(n);
  });
}
await run("generate a workout and start it", async () => {
  await page.goto(BASE + "/workout/generate");
  await page.getByRole("button", { name: "Generate workout" }).click();
  try {
    await page.getByRole("heading", { name: /Warm-up|Main/ }).first().waitFor({ timeout: 15000 });
  } catch (e) {
    await shot("29-generate-failure");
    throw e;
  }
  await page.getByRole("button", { name: "Start now" }).click();
  await page.waitForURL(/\/workout\/session\//);
  // Warm-up sets have no rest; mark the last set (a main/cool-down exercise) done and expect it to toggle.
  const btn = page.getByRole("button", { name: /Mark set 1 done/ }).nth(2);
  await btn.click();
  await page.getByRole("button", { name: /Mark set 1 not done/ }).first().waitFor();
  await shot("29-session");
});
await run("no horizontal overflow at phone width", async () => {
  for (const url of ["/", "/nutrition", "/workout", "/progress", "/settings/privacy"]) {
    await page.goto(BASE + url);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) throw new Error(`${url} overflows by ${overflow}px`);
  }
});

// Desktop + dark mode
const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "dark", storageState: await ctx.storageState() });
const dpage = await dctx.newPage();
dpage.on("pageerror", (e) => errors.push(`pageerror (desktop) ${e.message}`));
await run("desktop dark: home & progress", async () => {
  await dpage.goto(BASE + "/");
  await dpage.getByText("Today's overview").waitFor();
  await dpage.screenshot({ path: path.join(OUT, "30-desktop-dark-home.png") });
  await dpage.goto(BASE + "/progress");
  await dpage.getByText("Summary").waitFor();
  await dpage.waitForTimeout(500);
  await dpage.screenshot({ path: path.join(OUT, "31-desktop-dark-progress.png"), fullPage: true });
});

await run("no uncaught errors in the browser", async () => {
  if (errors.length) throw new Error(errors.slice(0, 5).join(" | "));
});

await browser.close();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots: ${OUT}`);
process.exit(failed ? 1 : 0);

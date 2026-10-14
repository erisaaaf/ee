# Vitality — AI health, fitness & nutrition platform

Mobile-first, installable web app (PWA) built from the project scope in `../AI Health, Fitness & Wellness Platform - Project Scope.pdf`.
Implementation status per requirement: `../PROJECT_IMPLEMENTATION_CHECKLIST.md`.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 + SQLite (better-sqlite3) · Zod · SWR · Recharts · Anthropic SDK (Claude) · Vitest · Playwright.

## Run it

Requires Node.js ≥ 20.9 (developed on Node 24).

```bash
cd web
npm install          # also generates the Prisma client
npm run setup        # creates .env with a fresh APP_ENCRYPTION_KEY, applies migrations, seeds foods & exercises
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start            # serve behind HTTPS in real deployments
```

## Configuration (`.env`, see `.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | SQLite file, default `file:./prisma/dev.db` |
| `APP_ENCRYPTION_KEY` | yes | 32-byte base64 key for field encryption. **Back it up — losing it makes encrypted notes/chats/2FA secrets unreadable.** |
| `APP_URL` | yes | Base URL used in password-reset links |
| `ANTHROPIC_API_KEY` | for AI | Enables coach, photo analysis, meal plans, recipe ideas, insights. Without it, AI screens show an "unavailable" state; everything else works. |
| `AI_MODEL` | no | Defaults to `claude-opus-5-5`. Requests use the server-side refusal fallback (`fallbacks: "default"`). |
| `AI_HOURLY_LIMIT` | no | Per-user AI requests/hour (default 40) |
| `USDA_API_KEY` | no | Adds USDA FoodData Central to online food search |
| `OPEN_FOOD_FACTS_ENABLED` | no | `false` disables barcode/branded lookups |
| `SMTP_URL`, `EMAIL_FROM` | for email | Password-reset email. In development the link is printed to the server log. |

## Tests

```bash
npm test                                   # 77 unit + integration tests (fresh migrated test DB each run)
npm run typecheck
npm run lint
# with a server running (dev or `npm start`):
node tests/e2e/api-journey.mjs http://localhost:3000
node tests/e2e/ui-smoke.mjs http://localhost:3000 ./test-results/screens   # needs `npx playwright install chromium`
```

## Architecture

```
src/
  app/(auth)/…            sign-in, registration, password reset, privacy notice
  app/(app)/…             authenticated screens (Home, Nutrition, Workout, Progress, AI Coach, Settings…)
  app/api/…               REST route handlers — thin: validate (Zod) → call a service
  server/http.ts          auth wrapper, CSRF origin check, rate limits, plain-language errors
  server/services/…       domain logic (diary, food, recipes, fitness, activity, wellness, goals, gamification, analytics, privacy, integrations)
  server/ai/…             AI provider boundary, safety prompt, tool layer (read tools scoped by user consent; write tools → PendingAction requiring user confirmation)
  server/food/…           built-in catalogue + Open Food Facts / USDA providers
  lib/…                   pure, shared logic (nutrition maths, energy estimate, units, barcodes, streaks, workout generator, Apple Health parser)
  components/…            design system & shared UI
prisma/                   schema, migrations, idempotent seed
```

Key rules the code follows: nutrients are stored per 100 g and `null` means *unknown* (never silently 0); diary entries snapshot nutrition so history stays correct; every write that can be repeated carries a `clientId` idempotency key; AI never writes data directly.

## Data sources

- Built-in foods: typical values compiled from public food-composition tables (e.g. USDA FoodData Central). Regional/composite dishes (byrek, flija, tavë kosi…) are explicitly marked **estimates**.
- Open Food Facts (ODbL, community data) for barcodes and branded products.
- Exercise library: 67 text-described exercises; no videos are bundled.

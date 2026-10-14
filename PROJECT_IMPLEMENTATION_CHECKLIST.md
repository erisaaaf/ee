# Project Implementation Checklist

Source of truth: **`AI Health, Fitness & Wellness Platform - Project Scope.pdf`** (53 pages, sections 1–93), read in full on 2026‑10‑11.
Codebase: `web/` (Next.js 16 + TypeScript + Prisma 7/SQLite + Claude API). There was no prior codebase — this is a new build.

**Status legend**

| Status | Meaning |
|---|---|
| **Verified** | Implemented **and** exercised by automated tests (unit/integration `npm test`, API journey `tests/e2e/api-journey.mjs`, and/or browser run `tests/e2e/ui-smoke.mjs`) against the running production build. |
| **Implemented** | Built and type-checked / lint-clean, reachable in the UI, but **not** exercised end-to-end by a test (usually because it needs a live AI key, a camera, GPS hardware, or a real device). |
| **In Progress** | Partially built; gaps listed. |
| **Blocked** | Needs credentials, hardware, a native app or a third-party approval that isn't available. Architecture prepared where noted. |
| **Not Started** | Not built. |

Test evidence keys: **U** = unit/integration (Vitest, 77 tests, `web/tests/*.test.ts`), **J** = API journey (19 steps), **B** = browser smoke (32 checks, Chromium, phone + desktop/dark).

---

## 1–4. Product principles, users, structure

| ID | Requirement | Status | Where | Tests | Notes / remaining |
|---|---|---|---|---|---|
| S1 | Connected ecosystem (data flows between features) | Verified | `server/services/analytics.ts`, dashboard, AI tools | J (food/workout/steps appear on dashboard & progress) | |
| S3 | Beginner → advanced support | Implemented | glossary `lib/glossary.ts` + `InfoTip`; advanced micronutrients behind expander; PR/1RM/volume charts | B (pages render) | |
| S4/S72 | Five primary areas: Home, Nutrition, Workout, Progress, AI Coach | Verified | `components/app-shell.tsx` (bottom nav mobile, sidebar desktop) | B | |

## 5–8. Onboarding, goals, preferences, plan engine

| ID | Requirement | Status | Where | Tests | Notes |
|---|---|---|---|---|---|
| S5.1a | Email + password accounts | Verified | `api/auth/*`, `services/auth.ts` | U, J, B | scrypt hashing, lockout after 5 failures |
| S5.1b | Social sign-in providers | **Blocked** | — | — | Needs OAuth client IDs (Google/Apple). Not built; shown as "not available yet" in Security. |
| S5.1c | Optional biometric auth | **Blocked / Not Started** | — | — | Would be WebAuthn passkeys; not built in this version (stated in UI). |
| S5.2 | Basic profile (all optional) | Verified | onboarding, `settings/profile` | U, B | name, birth year, sex, height, weight, activity, experience, units, country, language, timezone |
| S6 | Multiple goals, editable later | Verified | onboarding step 2, `settings/preferences` | B, J | |
| S7 | Fitness / nutrition / lifestyle preferences | Verified | onboarding steps 3–5, `settings/preferences` | B, J | limitations stored encrypted |
| S8 | Dynamic personalised plan engine | Implemented | `recalcTargets` (targets update on profile/goal/weight change), generator uses current equipment/time, AI tools read current prefs | U (targets recalc) | Weekly auto-adapting multi-week programme not built; plans regenerate on demand. |

## 9–10. Home & AI daily insight

| ID | Requirement | Status | Where | Tests | Notes |
|---|---|---|---|---|---|
| S9 | Daily overview with current / target / % / visual | Verified | `app/(app)/page.tsx`, `services/analytics.ts#dashboard` | U, J, B | Missing data shown as "not logged", never 0 |
| S10 | Optional AI daily insight | **Implemented** (needs key) | `ai/features.ts#dailyInsight` | U (unavailable path) | Real generation untested without `ANTHROPIC_API_KEY`; cached per day-part; toggle in Privacy |

## 11–23. Nutrition

| ID | Requirement | Status | Where | Tests | Notes |
|---|---|---|---|---|---|
| S11 | Search, saved foods, previous meals, custom foods, recipes, serving sizes, meals by time, favourite meals | Verified | `nutrition/*`, `services/diary.ts`, `services/food.ts` | U, J, B | copy-yesterday, saved meals, favourites, quick-add estimate |
| S12 | Food database (names, brands, servings, macros, micros; packaged, raw, cooked, restaurant, international, **Balkan/Albanian/Kosovan**) | Verified | `server/food/catalog.ts` (136 foods: 106 reference + 30 regional/composite estimates), Open Food Facts + optional USDA providers | U (search incl. Albanian names, diacritics) , J | Built-in values labelled "typical values"; regional dishes labelled **estimate**; unknown micros left null |
| S13 | Barcode / QR scanner with manual fallback; add unknown product | Verified (lookup) / Implemented (camera) | `nutrition/scan`, `lib/barcode.ts`, `services/food.ts#lookupBarcode` | U (GS1 check digits, UPC-E, GS1 Digital Link, non-food QR), J (live OFF lookup) | Camera decoding (zxing) not automatable in CI — needs a device test |
| S14 | AI food photo analysis with corrections, estimates labelled | **Implemented** (needs key) | `nutrition/photo`, `ai/features.ts#analyzeFoodPhoto` | U (image magic-byte validation, unavailable path) | Live model output untested without key. Photo resized client-side, EXIF stripped, not stored. |
| S15 | Calorie calculator; estimate vs actual clearly separated | Verified | `lib/energy.ts`, `settings/targets` | U (Mifflin–St Jeor, minors no deficit, <13 no estimate, missing data) | |
| S16 | Macro tracking: daily totals/targets, weekly averages, monthly trends | Verified | diary totals, `progress` charts | U, J, B | |
| S17 | Micronutrients where reliable, behind expander | Verified | `diary/micros`, `MicroSection` | U (null ≠ 0), B | partial data flagged |
| S18 | Custom foods CRUD | Verified | `nutrition/foods/*`, `api/foods/custom` | U, J | per-serving → per-100 g conversion; soft delete keeps history |
| S19 | Homemade recipes with per-serving nutrition, method, instructions, photo | Verified | `components/recipe-form.tsx`, `services/recipes.ts` | U, J, B | incomplete recipes flagged |
| S20/S81 | AI recipe generator / "What do I have?" with adjustments | **Implemented** (needs key) | `nutrition/ideas`, `ai/features.ts#generateRecipeIdeas` | — | nutrition calculated from DB matches when possible; allergen screen |
| S21 | Healthy food swaps without moralising | Verified (rule-based) / Implemented (AI) | `services/swaps.ts`, food detail page, `api/ai/swaps` | U (allergy-aware, no "bad/unhealthy" wording) | |
| S22 | AI meal planning; replace single meals | **Implemented** (needs key) | `nutrition/plans/*`, `ai/features.ts` | — | servings adjustable; allergen/diet conflicts surfaced; nutrition status calculated/partial/AI-estimate |
| S23 | Flexible dietary patterns | Verified | `DIET_PATTERNS`, `lib/allergens.ts#dietConflicts` | U | |

## 24–36. Hydration, fitness, sports, sleep, wellbeing, recovery

| ID | Requirement | Status | Where | Tests | Notes |
|---|---|---|---|---|---|
| S24 | Hydration: target, manual, quick-add, custom, progress, history, reminders, weekly trends | Verified | `hydration`, `QuickWater`, `services/wellness.ts` | U (idempotent), J (undo), B | |
| S25 | Workout entries (sets, reps, weight, distance, time, rest, notes) | Verified | `services/fitness.ts`, session page | U, J, B | |
| S26 | Exercise library (67 exercises: muscles, equipment, difficulty, instructions, mistakes, alternatives, home/gym versions) + equipment substitution | Verified | `server/fitness/exercises.ts`, `lib/workout-generator.ts#substitutes` | U ("No dumbbells?" substitutes), B | No videos/media (intentionally not invented) |
| S27 | Gym workouts: selection, sets/reps/weight, rest timer, notes, history, PRs, progress | Verified | `workout/*` | U (PR detection, progression), J, B | |
| S28 | Home workout generator by time/equipment/level/goal | Verified | `workout/generate` | U (budget, equipment, level), J, B | "available space" approximated by low-impact toggle |
| S29 | AI workout generator using history | **Implemented** (needs key) | AI coach `generate_workout` + `propose_save_workout` tools | U (unsafe/unknown proposals rejected) | |
| S30 | Workout adaptation ("only 30 min", "no dumbbells", injuries → conservative) | Implemented | generator `avoidAreas`/lowImpact, AI tools, safety prompt | U (avoid areas, notes recommend professional) | |
| S31 | Progressive overload tracking & per-exercise charts | Verified | `progress/strength`, `exerciseHistory` | U, B | est. 1RM labelled estimate |
| S32 | Sports tracker with sport-specific metrics | Verified | `lib/sports.ts`, `activity/*` | J, B | calories/HR only from user/device — never invented |
| S33 | GPS tracking with permission & explanation | Implemented | `activity/track` (browser Geolocation) | U/J (server-side route distance, glitch filter) | Live GPS needs a real device test; background tracking limited by browsers |
| S34 | Sleep tracking (manual + imported), consistency, trends | Verified | `wellbeing`, `services/wellness.ts` | U (midnight crossing), J | stages only stored if imported |
| S35 | Optional wellbeing (mood, energy, stress, recovery) | Verified | `wellbeing` | U, J | notes encrypted |
| S36 | Recovery overview labelled as estimate | Verified | `analytics.ts#recoveryOverview` | J (dashboard) | |

## 37. Wearables & health platforms

| ID | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| S37a | Apple Health **file import** (steps, sleep, resting HR) with per-category consent | Verified | `lib/apple-health.ts`, `settings/devices`, `services/integrations.ts` | U (no double-counting, sleep merging, consent enforcement, delete-on-disconnect) |
| S37b | GPX import (Garmin/Strava/Polar/etc.) | Verified | `importGpx` | U (parse, dedupe) |
| S37c | Apple Health / Apple Watch live sync | **Blocked** | registry entry | Requires native iOS app (HealthKit). |
| S37d | Google Health Connect / Wear OS / Samsung Health | **Blocked** | registry entry | Requires native Android app. |
| S37e | Fitbit, Garmin Connect API | **Blocked** | registry entry | Requires partner OAuth credentials / program approval. |

## 38–44. Progress, goals, gamification

| ID | Requirement | Status | Where | Tests |
|---|---|---|---|---|
| S38/S39 | Progress dashboard; charts for day/week/month/year/custom; tap to inspect a day | Verified | `progress`, `components/charts.tsx` (palette validated for CVD/contrast in light & dark) | J, B |
| S40 | Flexible, editable, pausable goals | Verified | `progress/goals`, `services/goals.ts` | U, J |
| S41 | Optional, sustainable challenges | Verified | `CHALLENGES`, `progress/rewards` | U, J |
| S42 | Flexible streaks with recovery | Verified | `lib/streaks.ts` (1 flex day/week; workout streaks in weeks) | U |
| S43 | Achievements only from real actions | Verified | `services/gamification.ts` | U (unfinished workout earns nothing; no duplicates), J |
| S44 | XP / levels / badges; can be disabled | Verified | derived XP, toggle in Preferences | U (toggle respected) |

## 45–49. AI

| ID | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| S45 | AI assistant using only authorised data | **Implemented** (needs key) | `ai/chat.ts`, `ai/tools.ts`, `coach` page | Tool layer & permission denial **Verified** (U); live conversations untested without key |
| S46 | Personalised AI coach | Implemented (needs key) | same | |
| S47 | AI weekly review (user-controlled) | Implemented (needs key) | `ai/features.ts#weeklyReview`, Progress | metrics layer verified (U) |
| S48 | Personalisation from history | Implemented | AI tools read history/preferences on demand | |
| S49 | AI safety rules | Implemented | `ai/core.ts#SAFETY_PROMPT`, allergen screen, unsafe-volume rejection, refusal handling, server-side refusal fallback | Prompt behaviour needs evaluation with a live key |
| S64 | Controlled data-access layer for AI | Verified | `ai/tools.ts` (category whitelist) | U |
| S65 | AI tool system; writes only via validated backend functions after confirmation | Verified | `PendingAction` + `resolvePendingAction` | U (nothing saved until confirm; cross-user blocked) |

## 50–53. Privacy & security

| ID | Requirement | Status | Where | Notes |
|---|---|---|---|---|
| S50a | Encryption in transit | Implemented | HSTS header in production | Requires HTTPS at the deployment (reverse proxy/host). |
| S50b | Encryption at rest | In Progress | AES-256-GCM field encryption for notes, AI messages, 2FA secrets, limitations | Full-database encryption (e.g. encrypted volume/SQLCipher) is a deployment task. |
| S50c | Secure auth & sessions, access control, audit logging | Verified | hashed session tokens, httpOnly SameSite cookies, sliding expiry, per-user scoping in every service, `AuditLog` | U, J |
| S51 | View / export / delete category / delete account / disconnect | Verified | `settings/privacy`, `services/privacy.ts` | U, J (cascade delete verified) |
| S52 | Privacy dashboard | Verified | `settings/privacy` | B |
| S53 | Strong passwords, hashing, 2FA, session management, device logout, rate limiting, validation, CSRF | Verified | `services/auth.ts`, `server/http.ts`, `ratelimit.ts` | U (RFC 6238 vector, lockout), J (CSRF 403) |
| S53b | Biometric auth | Blocked / Not Started | — | see S5.1c |

## 54–61. Platform features

| ID | Requirement | Status | Notes |
|---|---|---|---|
| S54 | Configurable reminders, fully disableable | Implemented | Notification API while app/tab open. Background push needs Web Push (VAPID) server — **not configured** (stated in UI). |
| S55 | Accessibility (contrast, touch targets ≥44px, screen-reader labels, reduced motion, accessible charts with table view) | Implemented | Verified no horizontal overflow at 390px (B). No formal WCAG audit performed. |
| S56 | Localisation (EN/SQ/DE architecture; localised food names) | In Progress | Architecture + EN complete; SQ/DE cover navigation & common actions; all 136 built-in foods have SQ/DE names. Full page-content translation remaining. |
| S57 | Metric / imperial | Verified | `lib/units.ts` (U); stored in metric |
| S58 | Global search (foods, recipes, exercises, workouts, sports, previous meals, goals, AI conversations) | Verified | U, J, B |
| S59 | Favourites (foods, meals, recipes, exercises, workouts) | Implemented | Favourite *sports* via preferred sports list. |
| S60 | Offline: view recent info, log water/workouts/saved foods/activities, sync on reconnect | Implemented | Outbox with idempotency keys + service worker (production). Not automatically tested offline. |
| S61 | Sync without duplicates | Verified | `clientId` idempotency (U, J) |

## 62–71, 84–87. Architecture, quality, errors, design

| ID | Requirement | Status | Notes |
|---|---|---|---|
| S62/S63 | Backend responsibilities & relational entities | Verified | Prisma schema (39 models), 2 additive migrations |
| S66 | Analytics engine separating raw / calculated / AI | Verified | `analytics.ts` vs `ai/*` |
| S67 | Dashboard personalisation (widgets, tracking categories) | Implemented | `settings/dashboard` |
| S68 | Beginner explanations for complex metrics | Implemented | glossary covers calories, macros, HR, HRV, recovery, VO₂max, progressive overload, 1RM |
| S69 | Contextual, dismissible recommendations | Verified (structure) | J/U check presence; rule triggers depend on time of day |
| S70 | User control (edit/reject/replace/disable/disconnect/delete) | Implemented | |
| S71 | Design principles | Implemented | Screenshots reviewed (phone light, desktop dark) |
| S84 | Performance | Implemented | No load testing performed. |
| S85 | Plain-language errors; technical details only in logs | Verified | `server/http.ts` (ref id), U/J |
| S86/S87 | Privacy- & security-by-design; server-side validation | Verified | Zod on every route; CSP & security headers checked on prod build |

## 78–83, 88–90. Roadmap items

| ID | Item | Status |
|---|---|---|
| S79 | Grocery lists from meal plans (check off, quantities, remove) | Implemented (generation is deterministic; needs a plan, which needs AI) |
| S80 | Budget-aware planning | Implemented (budget passed to AI planner / recipe generator) |
| S82 | Restaurant mode | Not Started (future feature in scope) |
| S83 | Travel mode | In Progress (preference toggle stored & given to AI; not yet changing generator defaults automatically) |
| S78 | Social, trainer accounts, community, voice coach, smart scale etc. | Not Started (explicitly future in scope) |
| S88 | **MVP** | **Complete** — all MVP items above are Verified except AI features, which are Implemented and need a key. |
| S89 | Version 2 | Mostly implemented (scanner, photo AI, meal planner, swaps, challenges, achievements, streaks, sleep & wellbeing) |
| S90 | Version 3 | Partially: grocery lists, budget-aware planning, file imports. Live wearables blocked; restaurant mode not started. |

---

## Known gaps & next steps (prioritised)

1. **Configure `ANTHROPIC_API_KEY` and evaluate AI features** (chat, photo analysis, meal plans, recipes, insights, weekly review) on real prompts; build an eval set for the safety rules.
2. **Deploy behind HTTPS** with an encrypted volume (or Postgres with at-rest encryption); set `SMTP_URL` for password-reset email.
3. **Web Push** (VAPID) for background reminders.
4. **Native companion app** (e.g. Capacitor/React Native) for HealthKit / Health Connect live sync and passkeys.
5. Complete **Albanian & German** translations of page content.
6. Device tests for camera barcode scanning and live GPS; a formal accessibility audit.
7. Restaurant mode, automatic travel-mode adaptations, social features (scope §78+).

_Last updated after: 77 unit/integration tests passing, 19/19 API journey steps, 32/32 browser checks, `tsc` clean, ESLint 0 errors, production build succeeded._

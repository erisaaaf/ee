import "server-only";
import { z } from "zod";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { asStrings } from "./profile";
import { routeStats } from "./activity";
import { zDate } from "../http";

// Integration registry. Status is reported honestly:
//  available            — works in this web app now
//  requires_native_app  — the platform only exposes data to native mobile apps (SDK on-device)
//  requires_credentials — needs a partner developer account / OAuth client configured by the operator
export const PROVIDERS = [
  {
    key: "apple_health_import",
    name: "Apple Health (file import)",
    status: "available",
    categories: ["steps", "sleep", "heart_rate"],
    description: "Import an export from the Health app on iPhone (Health → profile → Export All Health Data). The file is read in your browser; only daily totals for the categories you allow are uploaded.",
  },
  {
    key: "gpx_import",
    name: "GPX file (Garmin, Strava, Polar, Suunto, Coros…)",
    status: "available",
    categories: ["workouts"],
    description: "Import a recorded route as an activity. Distance and elevation are computed from the file's GPS points.",
  },
  {
    key: "apple_health",
    name: "Apple Health / Apple Watch (live sync)",
    status: "requires_native_app",
    categories: ["steps", "heart_rate", "workouts", "sleep", "calories", "distance", "active_minutes"],
    description: "HealthKit is only available to native iOS apps. Live sync needs the iOS companion app (not part of this web build).",
  },
  {
    key: "health_connect",
    name: "Google Health Connect / Wear OS",
    status: "requires_native_app",
    categories: ["steps", "heart_rate", "workouts", "sleep", "calories", "distance", "active_minutes"],
    description: "Health Connect is an on-device Android API. Live sync needs the Android companion app (not part of this web build).",
  },
  {
    key: "samsung_health",
    name: "Samsung Health",
    status: "requires_native_app",
    categories: ["steps", "heart_rate", "workouts", "sleep"],
    description: "Samsung Health data reaches apps through Health Connect on Android.",
  },
  {
    key: "fitbit",
    name: "Fitbit",
    status: "requires_credentials",
    categories: ["steps", "heart_rate", "workouts", "sleep"],
    description: "Requires a registered Fitbit Web API OAuth app (client ID/secret) configured by the server operator.",
  },
  {
    key: "garmin",
    name: "Garmin Connect",
    status: "requires_credentials",
    categories: ["steps", "heart_rate", "workouts", "sleep"],
    description: "Requires approval for the Garmin Connect Developer Program (Health API). You can import Garmin activities as GPX files today.",
  },
] as const;

export async function listIntegrations(userId: string) {
  const conns = await db.deviceConnection.findMany({ where: { userId } });
  const counts = await db.dailyMetric.groupBy({ by: ["source"], where: { userId, source: { startsWith: "import:" } }, _count: { _all: true } });
  const sleepCounts = await db.sleepEntry.groupBy({ by: ["source"], where: { userId, source: { startsWith: "import:" } }, _count: { _all: true } });
  const actCounts = await db.activity.count({ where: { userId, source: "import" } });
  return PROVIDERS.map((p) => {
    const c = conns.find((x) => x.provider === p.key);
    const src = `import:${p.key.replace("_import", "")}`;
    return {
      ...p,
      connected: c?.status === "connected",
      allowedCategories: c ? asStrings(c.categories) : [],
      connectedAt: c?.connectedAt ?? null,
      lastSyncAt: c?.lastSyncAt ?? null,
      lastSyncResult: c?.lastSyncResult ?? null,
      importedRecords:
        p.key === "gpx_import"
          ? actCounts
          : (counts.find((x) => x.source === src)?._count._all ?? 0) + (sleepCounts.find((x) => x.source === src)?._count._all ?? 0),
    };
  });
}

export async function setConsent(userId: string, provider: string, categories: string[]) {
  const p = PROVIDERS.find((x) => x.key === provider);
  if (!p) throw notFound("integration");
  if (p.status !== "available") throw badRequest(`${p.name} isn't available in this version: ${p.description}`);
  const allowed = categories.filter((c) => (p.categories as readonly string[]).includes(c));
  const row = await db.deviceConnection.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, categories: allowed, status: "connected" },
    update: { categories: allowed, status: "connected" },
  });
  await audit(userId, "integration.consent", { provider, categories: allowed.join(",") });
  return row;
}

/** Disconnect; optionally delete everything imported through it. */
export async function disconnect(userId: string, provider: string, deleteImported: boolean) {
  await db.deviceConnection.updateMany({ where: { userId, provider }, data: { status: "disconnected", categories: [] } });
  if (deleteImported) {
    if (provider === "gpx_import") await db.activity.deleteMany({ where: { userId, source: "import" } });
    else {
      const src = `import:${provider.replace("_import", "")}`;
      await db.dailyMetric.deleteMany({ where: { userId, source: src } });
      await db.sleepEntry.deleteMany({ where: { userId, source: src } });
    }
  }
  await audit(userId, "integration.disconnect", { provider, deleteImported });
}

async function requireConsent(userId: string, provider: string, category: string) {
  const c = await db.deviceConnection.findUnique({ where: { userId_provider: { userId, provider } } });
  if (!c || c.status !== "connected") throw badRequest("Connect this integration and choose which data to share first.");
  return asStrings(c.categories).includes(category);
}

// ── Apple Health import (client parses export.xml; server stores only consented daily aggregates) ──

export const appleImportSchema = z.object({
  steps: z.array(z.object({ date: zDate, value: z.number().int().min(0).max(200000) })).max(5000).default([]),
  restingHr: z.array(z.object({ date: zDate, value: z.number().min(25).max(220) })).max(5000).default([]),
  sleep: z
    .array(z.object({ date: zDate, bedtime: z.string().datetime(), wakeTime: z.string().datetime(), durationMin: z.number().int().min(30).max(1200) }))
    .max(5000)
    .default([]),
});

export async function importAppleHealth(userId: string, input: z.infer<typeof appleImportSchema>) {
  const provider = "apple_health_import";
  const src = "import:apple_health";
  const [allowSteps, allowSleep, allowHr] = await Promise.all([requireConsent(userId, provider, "steps"), requireConsent(userId, provider, "sleep"), requireConsent(userId, provider, "heart_rate")]);
  let steps = 0;
  let sleep = 0;
  let hr = 0;
  if (allowSteps) {
    for (const s of input.steps) {
      await db.dailyMetric.upsert({ where: { userId_date_metric_source: { userId, date: s.date, metric: "steps", source: src } }, create: { userId, date: s.date, metric: "steps", source: src, value: s.value }, update: { value: s.value } });
      steps++;
    }
  }
  if (allowHr) {
    for (const s of input.restingHr) {
      await db.dailyMetric.upsert({ where: { userId_date_metric_source: { userId, date: s.date, metric: "resting_hr", source: src } }, create: { userId, date: s.date, metric: "resting_hr", source: src, value: s.value }, update: { value: s.value } });
      hr++;
    }
  }
  if (allowSleep) {
    for (const s of input.sleep) {
      const data = { bedtime: new Date(s.bedtime), wakeTime: new Date(s.wakeTime), durationMin: s.durationMin };
      await db.sleepEntry.upsert({ where: { userId_date_source: { userId, date: s.date, source: src } }, create: { userId, date: s.date, source: src, ...data }, update: data });
      sleep++;
    }
  }
  const result = { steps, sleep, restingHr: hr, skipped: { steps: !allowSteps && input.steps.length > 0, sleep: !allowSleep && input.sleep.length > 0, restingHr: !allowHr && input.restingHr.length > 0 } };
  await db.deviceConnection.update({ where: { userId_provider: { userId, provider } }, data: { lastSyncAt: new Date(), lastSyncResult: result } });
  await audit(userId, "integration.import", { provider, steps, sleep, hr });
  return result;
}

// ── GPX import ──

export function parseGpx(xml: string) {
  const points: [number, number, number, number | null][] = [];
  const re = /<trkpt\b[^>]*?\blat="(-?[\d.]+)"[^>]*?\blon="(-?[\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  const re2 = /<trkpt\b[^>]*?\blon="(-?[\d.]+)"[^>]*?\blat="(-?[\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
  const push = (lat: number, lon: number, inner: string | undefined) => {
    const ele = inner?.match(/<ele>(-?[\d.]+)<\/ele>/)?.[1];
    const time = inner?.match(/<time>([^<]+)<\/time>/)?.[1];
    const t = time ? Date.parse(time) : NaN;
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) points.push([lat, lon, Number.isFinite(t) ? t : 0, ele ? Number(ele) : null]);
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) push(Number(m[1]), Number(m[2]), m[3]);
  if (!points.length) while ((m = re2.exec(xml))) push(Number(m[2]), Number(m[1]), m[3]);
  const type = xml.match(/<type>([^<]+)<\/type>/)?.[1]?.toLowerCase() ?? "";
  const name = xml.match(/<trk>[\s\S]*?<name>([^<]+)<\/name>/)?.[1]?.trim() ?? null;
  return { points, type, name };
}

export async function importGpx(userId: string, xml: string, overrideType?: string) {
  const c = await db.deviceConnection.findUnique({ where: { userId_provider: { userId, provider: "gpx_import" } } });
  if (!c || c.status !== "connected") await setConsent(userId, "gpx_import", ["workouts"]);
  const { points, type, name } = parseGpx(xml);
  if (points.length < 2) throw badRequest("We couldn't find a recorded track (trkpt points) in this GPX file.");
  const timed = points.filter((p) => p[2] > 0);
  if (timed.length < 2) throw badRequest("This GPX file has no timestamps, so we can't tell when or how long the activity was.");
  const start = timed[0][2];
  const end = timed[timed.length - 1][2];
  const durationMin = Math.max(1, Math.round((end - start) / 60000));
  const guess = overrideType ?? (/(run)/.test(type) ? "running" : /(bik|cycl|ride)/.test(type) ? "cycling" : /(hik)/.test(type) ? "hiking" : /(walk)/.test(type) ? "walking" : /(ski)/.test(type) ? "skiing" : "running");
  const stats = routeStats(points);
  const date = new Date(start).toISOString().slice(0, 10);
  const existing = await db.activity.findFirst({ where: { userId, source: "import", startedAt: new Date(start) } });
  if (existing) return { duplicate: true, activity: { ...existing, route: undefined } };
  const sampled = points.length > 5000 ? points.filter((_, i) => i % Math.ceil(points.length / 5000) === 0) : points;
  const a = await db.activity.create({
    data: {
      userId,
      type: guess,
      date,
      startedAt: new Date(start),
      durationMin,
      distanceM: stats.distanceM,
      elevationM: points.some((p) => p[3] != null) ? stats.elevationM : null,
      notes: name ? `Imported: ${name.slice(0, 100)}` : "Imported from GPX",
      source: "import",
      route: sampled,
    },
  });
  await db.deviceConnection.update({ where: { userId_provider: { userId, provider: "gpx_import" } }, data: { lastSyncAt: new Date(), lastSyncResult: { lastActivity: a.id } } });
  return { duplicate: false, activity: { ...a, route: undefined } };
}

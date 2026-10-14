import "server-only";
import { z } from "zod";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { SPORTS } from "@/lib/sports";
import { haversineM } from "@/lib/units";
import { zClientId, zDate } from "../http";

const routePoint = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180), z.number(), z.number().nullable().optional()]);

export const activitySchema = z.object({
  type: z.string().refine((t) => t in SPORTS, "Unknown activity type"),
  customName: z.string().trim().max(60).nullable().optional(),
  date: zDate,
  startedAt: z.string().datetime().optional(),
  durationMin: z.number().min(1, "Duration must be at least 1 minute").max(24 * 60),
  distanceM: z.number().min(0).max(1_000_000).nullable().optional(),
  elevationM: z.number().min(0).max(20000).nullable().optional(),
  avgHr: z.number().int().min(30).max(240).nullable().optional(),
  calories: z.number().min(0).max(20000).nullable().optional(),
  steps: z.number().int().min(0).max(200000).nullable().optional(),
  intensity: z.enum(["light", "moderate", "vigorous"]).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  source: z.enum(["manual", "gps"]).default("manual"),
  route: z.array(routePoint).max(20000).nullable().optional(),
  clientId: zClientId,
});

/** Distance and elevation gain computed from a recorded route (server-side, never trusted from the client). */
export function routeStats(route: [number, number, number, (number | null)?][]) {
  let dist = 0;
  let gain = 0;
  for (let i = 1; i < route.length; i++) {
    const [la1, lo1, , a1] = route[i - 1];
    const [la2, lo2, , a2] = route[i];
    const d = haversineM(la1, lo1, la2, lo2);
    if (d < 100) dist += d; // ignore implausible jumps (GPS glitches)
    if (a1 != null && a2 != null && a2 - a1 > 1) gain += a2 - a1;
  }
  return { distanceM: Math.round(dist), elevationM: Math.round(gain) };
}

export async function addActivity(userId: string, input: z.infer<typeof activitySchema>) {
  if (input.clientId) {
    const existing = await db.activity.findUnique({ where: { userId_clientId: { userId, clientId: input.clientId } } });
    if (existing) return existing;
  }
  if (input.source === "gps") {
    if (!input.route || input.route.length < 2) throw badRequest("No GPS points were recorded for this activity.");
    const stats = routeStats(input.route as [number, number, number, number?][]);
    input.distanceM = stats.distanceM;
    input.elevationM = input.route.some((p) => p[3] != null) ? stats.elevationM : null;
  } else {
    input.route = null; // routes are only stored for GPS-recorded activities
  }
  if (input.type === "custom" && !input.customName) throw badRequest("Give your activity a name.");
  const { route, startedAt, clientId, ...rest } = input;
  return db.activity.create({
    data: {
      userId,
      ...rest,
      clientId: clientId ?? null,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      route: route ? route.map((p) => [p[0], p[1], p[2], p[3] ?? null]) : undefined,
    },
  });
}

export const updateActivitySchema = activitySchema.omit({ source: true, route: true, clientId: true }).partial();

export async function updateActivity(userId: string, id: string, input: z.infer<typeof updateActivitySchema>) {
  const a = await db.activity.findFirst({ where: { id, userId } });
  if (!a) throw notFound("activity");
  // Distance for GPS activities comes from the route; don't let edits overwrite measured data.
  const { distanceM, elevationM, startedAt, ...rest } = input;
  return db.activity.update({
    where: { id },
    data: { ...rest, ...(startedAt ? { startedAt: new Date(startedAt) } : {}), ...(a.source === "gps" ? {} : { distanceM, elevationM }) },
  });
}

export async function deleteActivity(userId: string, id: string) {
  const { count } = await db.activity.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("activity");
}

export async function listActivities(userId: string, opts: { start?: string; end?: string; type?: string; limit?: number } = {}) {
  return db.activity.findMany({
    where: { userId, ...(opts.type ? { type: opts.type } : {}), ...(opts.start || opts.end ? { date: { gte: opts.start, lte: opts.end } } : {}) },
    orderBy: [{ date: "desc" }, { startedAt: "desc" }],
    take: opts.limit ?? 100,
    omit: { route: true },
  });
}

export async function getActivity(userId: string, id: string) {
  const a = await db.activity.findFirst({ where: { id, userId } });
  if (!a) throw notFound("activity");
  return a;
}

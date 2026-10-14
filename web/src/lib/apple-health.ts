// Apple Health export.xml aggregation (runs in the browser; only daily aggregates are uploaded).
// Pitfalls handled:
//  * Steps are recorded by several sources (iPhone + Apple Watch) for the same time → summing all sources
//    double-counts. We take, per day, the highest single-source total.
//  * Sleep has overlapping samples from several sources and stages. We merge "asleep" intervals per source
//    and keep the source with the most sleep for each night (keyed by wake-up date).

type Interval = [number, number];

const attr = (line: string, name: string) => line.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** "2024-01-05 23:10:00 +0100" → epoch ms. Returns NaN if unparseable. */
export function parseHkDate(s: string | undefined) {
  if (!s) return NaN;
  const m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/);
  if (!m) return Date.parse(s);
  return Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`);
}
const localDate = (s: string | undefined) => s?.slice(0, 10) ?? "";

function mergeIntervals(list: Interval[]) {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([...iv]);
  }
  return out;
}

export class AppleHealthAggregator {
  private steps = new Map<string, Map<string, number>>(); // date -> source -> total
  private hr = new Map<string, number[]>();
  private sleep = new Map<string, Map<string, { ivs: Interval[]; endIso: string; startIso: string }>>(); // wakeDate -> source -> intervals
  records = 0;

  line(line: string) {
    if (!line.includes("<Record")) return;
    const type = attr(line, "type");
    if (!type) return;
    if (type === "HKQuantityTypeIdentifierStepCount") {
      const date = localDate(attr(line, "startDate"));
      const src = attr(line, "sourceName") ?? "unknown";
      const v = Number(attr(line, "value"));
      if (!date || !Number.isFinite(v)) return;
      const bySrc = this.steps.get(date) ?? new Map();
      bySrc.set(src, (bySrc.get(src) ?? 0) + v);
      this.steps.set(date, bySrc);
      this.records++;
    } else if (type === "HKQuantityTypeIdentifierRestingHeartRate") {
      const date = localDate(attr(line, "startDate"));
      const v = Number(attr(line, "value"));
      if (!date || !Number.isFinite(v)) return;
      this.hr.set(date, [...(this.hr.get(date) ?? []), v]);
      this.records++;
    } else if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
      const value = attr(line, "value") ?? "";
      if (!/Asleep/i.test(value)) return; // skip InBed / Awake
      const startS = attr(line, "startDate");
      const endS = attr(line, "endDate");
      const start = parseHkDate(startS);
      const end = parseHkDate(endS);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      const wake = localDate(endS);
      const src = attr(line, "sourceName") ?? "unknown";
      const bySrc = this.sleep.get(wake) ?? new Map();
      const cur = bySrc.get(src) ?? { ivs: [], endIso: new Date(end).toISOString(), startIso: new Date(start).toISOString() };
      cur.ivs.push([start, end]);
      if (end > Date.parse(cur.endIso)) cur.endIso = new Date(end).toISOString();
      if (start < Date.parse(cur.startIso)) cur.startIso = new Date(start).toISOString();
      bySrc.set(src, cur);
      this.sleep.set(wake, bySrc);
      this.records++;
    }
  }

  result(sinceDate?: string) {
    const keep = (d: string) => !sinceDate || d >= sinceDate;
    const steps = [...this.steps.entries()].filter(([d]) => keep(d)).map(([date, bySrc]) => ({ date, value: Math.round(Math.max(...bySrc.values())) }));
    const restingHr = [...this.hr.entries()].filter(([d]) => keep(d)).map(([date, vs]) => ({ date, value: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) }));
    const sleep = [...this.sleep.entries()]
      .filter(([d]) => keep(d))
      .map(([date, bySrc]) => {
        let best: { durationMin: number; bedtime: string; wakeTime: string } | null = null;
        for (const s of bySrc.values()) {
          const merged = mergeIntervals(s.ivs);
          const durationMin = Math.round(merged.reduce((a, [x, y]) => a + (y - x), 0) / 60000);
          if (!best || durationMin > best.durationMin) best = { durationMin, bedtime: new Date(merged[0][0]).toISOString(), wakeTime: new Date(merged[merged.length - 1][1]).toISOString() };
        }
        return { date, ...best! };
      })
      .filter((s) => s.durationMin >= 30 && s.durationMin <= 1200);
    return { steps, restingHr, sleep };
  }
}

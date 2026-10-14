// Unit conversion. Everything is STORED in metric; conversion happens only at display/input time.
export type UnitSystem = "metric" | "imperial";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const M_PER_MILE = 1609.344;
export const ML_PER_FLOZ = 29.5735295625;

const r = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const mlToFlOz = (ml: number) => ml / ML_PER_FLOZ;
export const flOzToMl = (oz: number) => oz * ML_PER_FLOZ;

export function cmToFtIn(cm: number) {
  const totalIn = cm / CM_PER_IN;
  let ft = Math.floor(totalIn / 12);
  let inches = Math.round(totalIn - ft * 12);
  if (inches === 12) {
    ft += 1;
    inches = 0;
  }
  return { ft, in: inches };
}
export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * CM_PER_IN;

export function formatWeight(kg: number | null | undefined, units: UnitSystem) {
  if (kg == null) return "—";
  return units === "imperial" ? `${r(kgToLb(kg), 1)} lb` : `${r(kg, 1)} kg`;
}
export function formatDistance(m: number | null | undefined, units: UnitSystem) {
  if (m == null) return "—";
  return units === "imperial" ? `${r(m / M_PER_MILE, 2)} mi` : m >= 1000 ? `${r(m / 1000, 2)} km` : `${Math.round(m)} m`;
}
export function formatVolume(ml: number | null | undefined, units: UnitSystem) {
  if (ml == null) return "—";
  return units === "imperial" ? `${r(mlToFlOz(ml), 1)} fl oz` : ml >= 1000 ? `${r(ml / 1000, 2)} L` : `${Math.round(ml)} ml`;
}
export function formatHeight(cm: number | null | undefined, units: UnitSystem) {
  if (cm == null) return "—";
  if (units === "imperial") {
    const { ft, in: i } = cmToFtIn(cm);
    return `${ft}′ ${i}″`;
  }
  return `${Math.round(cm)} cm`;
}

/** Pace in seconds per km (or per mile for imperial), formatted mm:ss. */
export function formatPace(distanceM: number | null | undefined, durationMin: number, units: UnitSystem) {
  if (!distanceM || distanceM <= 0 || durationMin <= 0) return "—";
  const per = units === "imperial" ? distanceM / M_PER_MILE : distanceM / 1000;
  const secPer = (durationMin * 60) / per;
  const mm = Math.floor(secPer / 60);
  const ss = Math.round(secPer % 60);
  return `${mm}:${String(ss).padStart(2, "0")} /${units === "imperial" ? "mi" : "km"}`;
}
export function formatSpeed(distanceM: number | null | undefined, durationMin: number, units: UnitSystem) {
  if (!distanceM || durationMin <= 0) return "—";
  const h = durationMin / 60;
  return units === "imperial" ? `${r(distanceM / M_PER_MILE / h, 1)} mph` : `${r(distanceM / 1000 / h, 1)} km/h`;
}

/** Haversine distance in metres between two lat/lon points. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDuration(min: number | null | undefined) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

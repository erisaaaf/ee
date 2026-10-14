import "server-only";
import { plausiblePer100, type Per100 } from "@/lib/nutrition";
import { unavailable } from "../errors";

// External food-data providers behind one interface so they can be replaced or extended.
//  * Open Food Facts — open database of packaged products (ODbL). No key. Requires a descriptive User-Agent.
//    Rate limits (per their docs): ~100 product reads/min, ~10 searches/min → we cache and only search on demand.
//  * USDA FoodData Central — public-domain US data. Requires USDA_API_KEY (free).

export type ExternalFood = {
  provider: "openfoodfacts" | "usda";
  ref: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  per100: Per100;
  servingG: number | null;
  servingLabel: string | null;
  isLiquid: boolean;
  attribution: string;
};

const UA = "VitalityHealthApp/0.1 (self-hosted; +https://github.com/)";
const TIMEOUT_MS = 8000;

async function getJson(url: string, provider: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    throw unavailable("food_provider_unavailable", `We couldn't reach ${provider} right now. Check your connection or try again later.`);
  }
  if (res.status === 429) throw unavailable("food_provider_rate_limited", `${provider} is busy right now. Please try again in a minute.`);
  if (!res.ok && res.status !== 404) throw unavailable("food_provider_error", `${provider} returned an error. Please try again later.`);
  return res.json().catch(() => null);
}

// ── Open Food Facts ──
const OFF_FIELDS = "code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity,product_quantity_unit";
type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  nutriments?: Record<string, number | string | undefined>;
  serving_size?: string;
  serving_quantity?: number | string;
  product_quantity_unit?: string;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function offToExternal(p: OffProduct): ExternalFood | null {
  const n = p.nutriments ?? {};
  const g = (key: string) => num(n[`${key}_100g`]);
  const gToMg = (v: number | null) => (v == null ? null : Math.round(v * 1000 * 100) / 100);
  const gToUg = (v: number | null) => (v == null ? null : Math.round(v * 1_000_000 * 10) / 10);
  let kcal = g("energy-kcal");
  if (kcal == null) {
    const kj = g("energy-kj") ?? (n["energy_unit"] === "kJ" ? g("energy") : null);
    if (kj != null) kcal = Math.round(kj / 4.184);
  }
  const per100: Per100 = {
    kcal,
    proteinG: g("proteins"),
    carbsG: g("carbohydrates"),
    fatG: g("fat"),
    fiberG: g("fiber"),
    sugarG: g("sugars"),
    sodiumMg: gToMg(g("sodium") ?? (g("salt") != null ? g("salt")! / 2.5 : null)),
    ironMg: gToMg(g("iron")),
    calciumMg: gToMg(g("calcium")),
    potassiumMg: gToMg(g("potassium")),
    magnesiumMg: gToMg(g("magnesium")),
    vitAUg: gToUg(g("vitamin-a")),
    vitCMg: gToMg(g("vitamin-c")),
    vitDUg: gToUg(g("vitamin-d")),
    vitB12Ug: gToUg(g("vitamin-b12")),
    folateUg: gToUg(g("vitamin-b9") ?? g("folates")),
  };
  const name = (p.product_name || p.product_name_en || "").trim();
  if (!name || !p.code) return null;
  if (!plausiblePer100(per100).ok) return null;
  const servingG = num(p.serving_quantity);
  return {
    provider: "openfoodfacts",
    ref: p.code,
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    barcode: /^\d{6,14}$/.test(p.code) ? p.code : null,
    per100,
    servingG: servingG && servingG > 0 && servingG < 5000 ? servingG : null,
    servingLabel: p.serving_size?.slice(0, 60) || null,
    isLiquid: p.product_quantity_unit === "ml",
    attribution: "Open Food Facts (community data, ODbL)",
  };
}

export async function offLookupBarcode(code: string): Promise<ExternalFood | null> {
  if (process.env.OPEN_FOOD_FACTS_ENABLED === "false") return null;
  const json = (await getJson(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`,
    "Open Food Facts",
  )) as { status?: number; product?: OffProduct } | null;
  if (!json || json.status !== 1 || !json.product) return null;
  return offToExternal({ ...json.product, code: json.product.code ?? code });
}

export async function offSearch(query: string, pageSize = 15): Promise<ExternalFood[]> {
  if (process.env.OPEN_FOOD_FACTS_ENABLED === "false") return [];
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${OFF_FIELDS}`;
  const json = (await getJson(url, "Open Food Facts")) as { products?: OffProduct[] } | null;
  return (json?.products ?? []).map(offToExternal).filter((f): f is ExternalFood => f !== null && f.per100.kcal != null);
}

// ── USDA FoodData Central ──
type UsdaNutrient = { nutrientId?: number; nutrientNumber?: string; value?: number; amount?: number; nutrient?: { id?: number; number?: string } };
type UsdaFood = { fdcId: number; description: string; brandOwner?: string; brandName?: string; gtinUpc?: string; dataType?: string; servingSize?: number; servingSizeUnit?: string; foodNutrients?: UsdaNutrient[] };

const USDA_IDS: Record<string, number[]> = {
  kcal: [1008, 2047, 2048],
  proteinG: [1003],
  carbsG: [1005],
  fatG: [1004],
  fiberG: [1079],
  sugarG: [2000, 1063],
  sodiumMg: [1093],
  calciumMg: [1087],
  ironMg: [1089],
  potassiumMg: [1092],
  magnesiumMg: [1090],
  vitAUg: [1106],
  vitCMg: [1162],
  vitDUg: [1114],
  vitB12Ug: [1178],
  folateUg: [1190, 1177],
};

export function usdaToExternal(f: UsdaFood): ExternalFood | null {
  const byId = new Map<number, number>();
  for (const n of f.foodNutrients ?? []) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const v = n.value ?? n.amount;
    if (id != null && typeof v === "number") byId.set(id, v);
  }
  const per100: Per100 = {};
  for (const [key, ids] of Object.entries(USDA_IDS)) {
    const id = ids.find((i) => byId.has(i));
    (per100 as Record<string, number | null>)[key] = id != null ? byId.get(id)! : null;
  }
  if (!plausiblePer100(per100).ok || per100.kcal == null) return null;
  const servingG = f.servingSizeUnit?.toLowerCase() === "g" || f.servingSizeUnit?.toLowerCase() === "ml" ? f.servingSize ?? null : null;
  return {
    provider: "usda",
    ref: String(f.fdcId),
    name: f.description.slice(0, 120),
    brand: f.brandName || f.brandOwner || null,
    barcode: f.gtinUpc && /^\d{6,14}$/.test(f.gtinUpc) ? f.gtinUpc : null,
    per100,
    servingG,
    servingLabel: servingG ? `${servingG} ${f.servingSizeUnit?.toLowerCase()}` : null,
    isLiquid: f.servingSizeUnit?.toLowerCase() === "ml",
    attribution: `USDA FoodData Central (${f.dataType ?? "database"})`,
  };
}

export const usdaConfigured = () => Boolean(process.env.USDA_API_KEY);

export async function usdaSearch(query: string, pageSize = 15): Promise<ExternalFood[]> {
  const key = process.env.USDA_API_KEY;
  if (!key) return [];
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&pageSize=${pageSize}&dataType=${encodeURIComponent("Foundation,SR Legacy,Branded")}`;
  const json = (await getJson(url, "USDA FoodData Central")) as { foods?: UsdaFood[] } | null;
  return (json?.foods ?? []).map(usdaToExternal).filter((f): f is ExternalFood => f !== null);
}

export async function usdaGet(fdcId: string): Promise<ExternalFood | null> {
  const key = process.env.USDA_API_KEY;
  if (!key || !/^\d+$/.test(fdcId)) return null;
  const json = (await getJson(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${encodeURIComponent(key)}`, "USDA FoodData Central")) as UsdaFood | null;
  return json?.fdcId ? usdaToExternal(json) : null;
}

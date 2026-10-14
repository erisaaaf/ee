import { normalize } from "./text";

// Keyword-based allergen screen used as a SAFETY NET on AI output (the prompt also forbids allergens).
// It errs on the side of flagging; a flag is shown to the user, never silently ignored.
export const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  gluten: ["wheat", "flour", "bread", "pasta", "spaghetti", "noodle", "couscous", "bulgur", "barley", "rye", "semolina", "seitan", "byrek", "burek", "pita", "tortilla", "cracker", "breadcrumb", "croissant", "pogace", "flija", "beer", "spelt", "oat"],
  dairy: ["milk", "cheese", "yogurt", "yoghurt", "kos", "butter", "cream", "kefir", "feta", "mozzarella", "parmesan", "ricotta", "whey", "djathe", "gjize", "ayran", "dhalle", "kajmak", "ghee", "casein"],
  lactose: ["milk", "cheese", "yogurt", "yoghurt", "kos", "butter", "cream", "kefir", "feta", "mozzarella", "ricotta", "whey", "djathe", "gjize", "ayran", "dhalle", "kajmak"],
  eggs: ["egg", "mayonnaise", "meringue", "veze"],
  peanuts: ["peanut", "kikirik"],
  tree_nuts: ["almond", "walnut", "cashew", "hazelnut", "pistachio", "pecan", "pine nut", "macadamia", "brazil nut", "praline", "nutella", "arra", "bajame", "baklava", "bakllava"],
  soy: ["soy", "tofu", "edamame", "tempeh", "miso", "soya"],
  fish: ["salmon", "tuna", "cod", "trout", "fish", "anchovy", "sardine", "mackerel", "hake", "sea bass", "troft", "peshk"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "mussel", "clam", "oyster", "squid", "calamari", "octopus", "scallop", "karkalec"],
  sesame: ["sesame", "tahini", "hummus", "halva"],
};

export const DIET_EXCLUSIONS: Record<string, string[]> = {
  vegetarian: ["chicken", "beef", "pork", "lamb", "turkey", "veal", "bacon", "ham", "salami", "sausage", "mince", "meat", "fish", "salmon", "tuna", "cod", "shrimp", "prawn", "anchovy", "gelatin", "qebap", "cevap", "mish"],
  vegan: ["chicken", "beef", "pork", "lamb", "turkey", "veal", "bacon", "ham", "salami", "sausage", "mince", "meat", "fish", "salmon", "tuna", "cod", "shrimp", "prawn", "anchovy", "gelatin", "egg", "milk", "cheese", "yogurt", "butter", "cream", "honey", "kefir", "feta", "whey", "qebap", "mish", "kos", "djathe"],
  pescatarian: ["chicken", "beef", "pork", "lamb", "turkey", "veal", "bacon", "ham", "salami", "sausage", "mince", "meat", "qebap", "mish"],
  halal: ["pork", "bacon", "ham", "lard", "wine", "beer", "gelatin"],
};

function words(s: string) {
  return ` ${normalize(s)} `;
}

/** Returns warnings like { allergen: "dairy", ingredient: "feta cheese" }. Custom allergy names are matched literally. */
export function allergenConflicts(ingredientNames: string[], allergies: string[]) {
  const out: { allergen: string; ingredient: string }[] = [];
  for (const allergy of allergies) {
    const key = normalize(allergy).replace(/\s+/g, "_");
    const keywords = ALLERGEN_KEYWORDS[key] ?? [normalize(allergy)];
    for (const name of ingredientNames) {
      const w = words(name);
      // "coconut milk", "almond milk" etc. are not dairy.
      if ((key === "dairy" || key === "lactose") && /\b(coconut|almond|oat|soy|rice) milk\b/.test(w)) continue;
      if ((key === "gluten") && /\bgluten free\b/.test(w)) continue;
      if (keywords.some((k) => w.includes(` ${k}`))) out.push({ allergen: allergy, ingredient: name });
    }
  }
  return out;
}

export function dietConflicts(ingredientNames: string[], diet: string) {
  const ex = DIET_EXCLUSIONS[diet];
  if (!ex) return [];
  return ingredientNames.filter((n) => {
    const w = words(n);
    if (/\b(plant based|vegan|meatless|veggie|soy|oat|almond|coconut)\b/.test(w)) return false;
    return ex.some((k) => w.includes(` ${k}`));
  });
}

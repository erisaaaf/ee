// Plain-language explanations for beginners (scope §68). Shown behind an optional "What's this?" button.
export const GLOSSARY: Record<string, { title: string; text: string }> = {
  calories: { title: "Calories", text: "Calories measure the energy in food and drinks. Your body uses energy for everything — breathing, moving, thinking. Needs differ a lot between people, so any target here is an estimate." },
  protein: { title: "Protein", text: "Protein is a nutrient your body uses for many functions, including maintaining and building tissues like muscle. Foods like eggs, dairy, beans, lentils, fish and meat are good sources." },
  carbs: { title: "Carbohydrates", text: "Carbohydrates are your body's main and quickest source of energy. They're in bread, rice, pasta, potatoes, fruit, legumes and sugar. Whole-grain and high-fibre options release energy more steadily." },
  fat: { title: "Fat", text: "Fat helps your body absorb some vitamins and is a concentrated energy source. Olive oil, nuts, seeds, avocado and fish provide fats many people like to include regularly." },
  fiber: { title: "Fibre", text: "Fibre is a part of plant foods your body doesn't fully digest. It supports digestion and helps you feel full. Vegetables, fruit, whole grains, beans and lentils are rich in fibre." },
  macros: { title: "Macros", text: "“Macros” (macronutrients) are the three nutrients that provide energy: protein, carbohydrates and fat. Fibre is often tracked alongside them." },
  micros: { title: "Micronutrients", text: "Vitamins and minerals your body needs in small amounts, like iron, calcium and vitamin C. We only show them where the food data includes them, so totals may be incomplete." },
  heartRate: { title: "Heart rate", text: "How many times your heart beats per minute. It rises with effort. Device readings are estimates, not medical measurements." },
  hrv: { title: "HRV", text: "Heart-rate variability is the small variation in time between heartbeats. Some wearables use it as a rough recovery signal. It varies a lot between people and isn't a diagnosis." },
  recovery: { title: "Recovery overview", text: "A general estimate built from the sleep, recent training and energy check-ins you've logged. It's a prompt to listen to your body — not a medical assessment." },
  vo2max: { title: "VO₂ max", text: "An estimate of how much oxygen your body can use during intense exercise — a common fitness indicator. Wearables estimate it; lab tests measure it." },
  progressiveOverload: { title: "Progressive overload", text: "Gradually asking a bit more of your body over time — e.g. one more rep, slightly more weight, or an extra set — so you keep improving. Small steps are enough." },
  oneRepMax: { title: "Estimated 1-rep max", text: "A calculated guess of the heaviest weight you could lift once, based on a set you did (Epley formula). It's an estimate for tracking progress — you don't need to test it." },
  estimate: { title: "Estimates", text: "Values marked “estimate” come from calculations, photos or typical recipes — not exact measurements. They're useful for trends, not precise counting." },
  energyTarget: { title: "Energy target", text: "We estimate daily energy needs with the Mifflin–St Jeor equation and your activity level. Real needs can differ by 10–20% or more. You can always set your own target." },
};
export type GlossaryKey = keyof typeof GLOSSARY;

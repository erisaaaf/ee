// Built-in food catalogue.
//
// DATA PROVENANCE — please read before editing:
//  * quality "reference": typical per-100 g values for single foods, compiled from public food-composition
//    tables (primarily USDA FoodData Central / SR Legacy). Real products vary by variety, brand and preparation.
//  * quality "estimate": composite / regional dishes (e.g. byrek, flija, tavë kosi). Recipes vary widely between
//    households and restaurants, so these are rough estimates and are labelled as such in the UI.
//  * Micronutrients are only filled in where reasonably well established; otherwise left null (= unknown).
//
// Tuple: [name, category, region, kcal, protein, carbs, fat, fiber, sugar, sodiumMg, servings, local names, micros]

type Micros = Partial<{
  ironMg: number;
  calciumMg: number;
  potassiumMg: number;
  magnesiumMg: number;
  vitAUg: number;
  vitCMg: number;
  vitDUg: number;
  vitB12Ug: number;
  folateUg: number;
}>;
type Row = [
  name: string,
  category: string,
  region: "international" | "balkan",
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number | null,
  sugar: number | null,
  sodium: number | null,
  servings: [label: string, grams: number][],
  local?: { sq?: string; de?: string },
  micros?: Micros,
];

const R = "international" as const;
const B = "balkan" as const;

export const REFERENCE_ROWS: Row[] = [
  // Fruit
  ["Apple, raw", "fruit", R, 52, 0.3, 13.8, 0.2, 2.4, 10.4, 1, [["1 medium", 182], ["1 small", 150]], { sq: "Mollë", de: "Apfel" }, { potassiumMg: 107, vitCMg: 4.6, calciumMg: 6 }],
  ["Banana, raw", "fruit", R, 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, [["1 medium", 118], ["1 large", 136]], { sq: "Banane", de: "Banane" }, { potassiumMg: 358, magnesiumMg: 27, vitCMg: 8.7 }],
  ["Orange, raw", "fruit", R, 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, [["1 medium", 131]], { sq: "Portokall", de: "Orange" }, { vitCMg: 53.2, calciumMg: 40, potassiumMg: 181, folateUg: 30 }],
  ["Strawberries, raw", "fruit", R, 32, 0.7, 7.7, 0.3, 2.0, 4.9, 1, [["1 cup", 152], ["5 berries", 60]], { sq: "Luleshtrydhe", de: "Erdbeeren" }, { vitCMg: 58.8, potassiumMg: 153, folateUg: 24 }],
  ["Grapes, raw", "fruit", R, 69, 0.7, 18.1, 0.2, 0.9, 15.5, 2, [["1 cup", 151]], { sq: "Rrush", de: "Weintrauben" }, { potassiumMg: 191 }],
  ["Watermelon, raw", "fruit", R, 30, 0.6, 7.6, 0.2, 0.4, 6.2, 1, [["1 wedge", 286], ["1 cup diced", 152]], { sq: "Shalqi", de: "Wassermelone" }, { vitCMg: 8.1, potassiumMg: 112 }],
  ["Pear, raw", "fruit", R, 57, 0.4, 15.2, 0.1, 3.1, 9.8, 1, [["1 medium", 178]], { sq: "Dardhë", de: "Birne" }],
  ["Peach, raw", "fruit", R, 39, 0.9, 9.5, 0.3, 1.5, 8.4, 0, [["1 medium", 150]], { sq: "Pjeshkë", de: "Pfirsich" }],
  ["Blueberries, raw", "fruit", R, 57, 0.7, 14.5, 0.3, 2.4, 10.0, 1, [["1 cup", 148]], { sq: "Boronica", de: "Heidelbeeren" }, { vitCMg: 9.7 }],
  ["Kiwi, raw", "fruit", R, 61, 1.1, 14.7, 0.5, 3.0, 9.0, 3, [["1 fruit", 69]], { sq: "Kivi", de: "Kiwi" }, { vitCMg: 92.7, potassiumMg: 312 }],
  ["Avocado, raw", "fruit", R, 160, 2.0, 8.5, 14.7, 6.7, 0.7, 7, [["½ avocado", 68]], { sq: "Avokado", de: "Avocado" }, { potassiumMg: 485, folateUg: 81, magnesiumMg: 29 }],
  ["Plums, raw", "fruit", R, 46, 0.7, 11.4, 0.3, 1.4, 9.9, 0, [["1 plum", 66]], { sq: "Kumbulla", de: "Pflaumen" }],
  ["Figs, fresh", "fruit", R, 74, 0.8, 19.2, 0.3, 2.9, 16.3, 1, [["1 medium", 50]], { sq: "Fiq", de: "Feigen" }],
  ["Dates, Medjool", "fruit", R, 277, 1.8, 75.0, 0.2, 6.7, 66.5, 1, [["1 date", 24]], { sq: "Hurma", de: "Datteln" }, { potassiumMg: 696 }],
  ["Raisins", "fruit", R, 299, 3.1, 79.2, 0.5, 3.7, 59.2, 11, [["1 small box", 43]], { sq: "Rrush i thatë", de: "Rosinen" }],
  // Vegetables
  ["Tomato, raw", "vegetable", R, 18, 0.9, 3.9, 0.2, 1.2, 2.6, 5, [["1 medium", 123]], { sq: "Domate", de: "Tomate" }, { vitCMg: 13.7, potassiumMg: 237 }],
  ["Cucumber, raw", "vegetable", R, 15, 0.7, 3.6, 0.1, 0.5, 1.7, 2, [["½ cucumber", 150]], { sq: "Kastravec", de: "Gurke" }],
  ["Bell pepper, red, raw", "vegetable", R, 31, 1.0, 6.0, 0.3, 2.1, 4.2, 4, [["1 medium", 119]], { sq: "Spec i kuq", de: "Paprika, rot" }, { vitCMg: 127.7 }],
  ["Bell pepper, green, raw", "vegetable", R, 20, 0.9, 4.6, 0.2, 1.7, 2.4, 3, [["1 medium", 119]], { sq: "Spec jeshil", de: "Paprika, grün" }, { vitCMg: 80.4 }],
  ["Carrot, raw", "vegetable", R, 41, 0.9, 9.6, 0.2, 2.8, 4.7, 69, [["1 medium", 61]], { sq: "Karotë", de: "Karotte" }, { vitAUg: 835 }],
  ["Broccoli, raw", "vegetable", R, 34, 2.8, 6.6, 0.4, 2.6, 1.7, 33, [["1 cup chopped", 91]], { sq: "Brokoli", de: "Brokkoli" }, { vitCMg: 89.2, calciumMg: 47, potassiumMg: 316, folateUg: 63 }],
  ["Spinach, raw", "vegetable", R, 23, 2.9, 3.6, 0.4, 2.2, 0.4, 79, [["1 cup", 30]], { sq: "Spinaq", de: "Spinat" }, { ironMg: 2.7, calciumMg: 99, magnesiumMg: 79, potassiumMg: 558, vitAUg: 469, vitCMg: 28.1, folateUg: 194 }],
  ["Lettuce, romaine", "vegetable", R, 17, 1.2, 3.3, 0.3, 2.1, 1.2, 8, [["1 cup shredded", 47]], { sq: "Sallatë jeshile", de: "Römersalat" }],
  ["Onion, raw", "vegetable", R, 40, 1.1, 9.3, 0.1, 1.7, 4.2, 4, [["1 medium", 110]], { sq: "Qepë", de: "Zwiebel" }],
  ["Garlic, raw", "vegetable", R, 149, 6.4, 33.1, 0.5, 2.1, 1.0, 17, [["1 clove", 3]], { sq: "Hudhër", de: "Knoblauch" }],
  ["Potato, boiled (no skin)", "vegetable", R, 86, 1.7, 20.0, 0.1, 1.8, 0.9, 5, [["1 medium", 167]], { sq: "Patate të ziera", de: "Kartoffeln, gekocht" }, { potassiumMg: 328 }],
  ["Potato, baked with skin", "vegetable", R, 93, 2.5, 21.2, 0.1, 2.2, 1.2, 10, [["1 medium", 173]], { sq: "Patate në furrë", de: "Ofenkartoffel" }, { potassiumMg: 535 }],
  ["Sweet potato, baked", "vegetable", R, 90, 2.0, 20.7, 0.2, 3.3, 6.5, 36, [["1 medium", 114]], { sq: "Patate e ëmbël", de: "Süßkartoffel" }, { vitAUg: 961 }],
  ["Zucchini, raw", "vegetable", R, 17, 1.2, 3.1, 0.3, 1.0, 2.5, 8, [["1 medium", 196]], { sq: "Kungulleshë", de: "Zucchini" }],
  ["Eggplant, raw", "vegetable", R, 25, 1.0, 5.9, 0.2, 3.0, 3.5, 2, [["1 cup cubed", 82]], { sq: "Patëllxhan", de: "Aubergine" }],
  ["Mushrooms, white, raw", "vegetable", R, 22, 3.1, 3.3, 0.3, 1.0, 2.0, 5, [["1 cup sliced", 70]], { sq: "Kërpudha", de: "Champignons" }],
  ["Cabbage, raw", "vegetable", R, 25, 1.3, 5.8, 0.1, 2.5, 3.2, 18, [["1 cup shredded", 89]], { sq: "Lakër", de: "Weißkohl" }, { vitCMg: 36.6 }],
  ["Green beans, raw", "vegetable", R, 31, 1.8, 7.0, 0.2, 2.7, 3.3, 6, [["1 cup", 100]], { sq: "Bishtaja", de: "Grüne Bohnen" }],
  ["Green peas, raw", "vegetable", R, 81, 5.4, 14.5, 0.4, 5.1, 5.7, 5, [["½ cup", 73]], { sq: "Bizele", de: "Erbsen" }],
  ["Sweet corn, boiled", "vegetable", R, 96, 3.4, 21.0, 1.5, 2.4, 4.5, 1, [["1 ear", 103]], { sq: "Misër i zier", de: "Mais, gekocht" }],
  ["Cauliflower, raw", "vegetable", R, 25, 1.9, 5.0, 0.3, 2.0, 1.9, 30, [["1 cup", 107]], { sq: "Lulelakër", de: "Blumenkohl" }, { vitCMg: 48.2 }],
  // Grains & bread
  ["White rice, cooked", "grain", R, 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, [["1 cup", 158], ["½ cup", 79]], { sq: "Oriz i bardhë, i zier", de: "Reis, weiß, gekocht" }],
  ["Brown rice, cooked", "grain", R, 111, 2.6, 23.0, 0.9, 1.8, 0.4, 5, [["1 cup", 195]], { sq: "Oriz integral, i zier", de: "Naturreis, gekocht" }, { magnesiumMg: 43 }],
  ["Pasta, cooked", "grain", R, 158, 5.8, 30.9, 0.9, 1.8, 0.6, 1, [["1 cup", 140]], { sq: "Makarona, të ziera", de: "Nudeln, gekocht" }],
  ["Pasta, dry", "grain", R, 371, 13.0, 74.7, 1.5, 3.2, 2.7, 6, [["1 portion", 80]], { sq: "Makarona, të thata", de: "Nudeln, trocken" }],
  ["Oats, rolled (dry)", "grain", R, 379, 13.2, 67.7, 6.5, 10.1, 1.0, 6, [["½ cup", 40]], { sq: "Tërshërë", de: "Haferflocken" }, { ironMg: 4.3, magnesiumMg: 138 }],
  ["White bread", "bread", R, 266, 7.6, 50.6, 3.3, 2.4, 5.7, 490, [["1 slice", 28]], { sq: "Bukë e bardhë", de: "Weißbrot" }],
  ["Whole-wheat bread", "bread", R, 252, 12.4, 42.7, 3.5, 6.0, 4.4, 450, [["1 slice", 32]], { sq: "Bukë integrale", de: "Vollkornbrot" }],
  ["Bulgur, cooked", "grain", R, 83, 3.1, 18.6, 0.2, 4.5, 0.1, 5, [["1 cup", 182]], { sq: "Bulgur", de: "Bulgur, gekocht" }],
  ["Quinoa, cooked", "grain", R, 120, 4.4, 21.3, 1.9, 2.8, 0.9, 7, [["1 cup", 185]], { sq: "Kinoa", de: "Quinoa, gekocht" }],
  ["Couscous, cooked", "grain", R, 112, 3.8, 23.2, 0.2, 1.4, 0.1, 5, [["1 cup", 157]], { sq: "Kuskus", de: "Couscous, gekocht" }],
  ["Croissant, butter", "bakery", R, 406, 8.2, 45.8, 21.0, 2.6, 11.3, 467, [["1 medium", 57]], { sq: "Kroasan", de: "Croissant" }],
  // Protein foods
  ["Chicken breast, roasted, skinless", "meat", R, 165, 31.0, 0, 3.6, 0, 0, 74, [["1 portion", 120], ["½ breast", 86]], { sq: "Gjoks pule, i pjekur", de: "Hähnchenbrust, gebraten" }, { ironMg: 1.0, potassiumMg: 256, vitB12Ug: 0.3 }],
  ["Chicken breast, raw", "meat", R, 120, 22.5, 0, 2.6, 0, 0, 45, [["1 breast", 174]], { sq: "Gjoks pule, i papjekur", de: "Hähnchenbrust, roh" }],
  ["Chicken thigh, roasted, skinless", "meat", R, 209, 26.0, 0, 10.9, 0, 0, 88, [["1 thigh", 52]], { sq: "Kofshë pule", de: "Hähnchenschenkel" }],
  ["Ground beef 85% lean, cooked", "meat", R, 250, 25.9, 0, 15.4, 0, 0, 72, [["1 portion", 100]], { sq: "Mish viçi i grirë, i gatuar", de: "Rinderhack, gebraten" }, { ironMg: 2.6, vitB12Ug: 2.6 }],
  ["Pork loin, roasted", "meat", R, 242, 27.3, 0, 13.9, 0, 0, 62, [["1 portion", 100]], { sq: "Mish derri", de: "Schweinelende" }],
  ["Turkey breast, roasted", "meat", R, 147, 30.1, 0, 2.1, 0, 0, 99, [["1 portion", 100]], { sq: "Gjoks gjeldeti", de: "Putenbrust" }],
  ["Salmon, farmed, cooked", "fish", R, 206, 22.1, 0, 12.4, 0, 0, 61, [["1 fillet", 154]], { sq: "Salmon", de: "Lachs, gegart" }, { vitB12Ug: 2.8, potassiumMg: 384 }],
  ["Tuna, canned in water, drained", "fish", R, 116, 25.5, 0, 0.8, 0, 0, 247, [["1 can drained", 120]], { sq: "Ton në ujë", de: "Thunfisch im eigenen Saft" }],
  ["Cod, cooked", "fish", R, 105, 22.8, 0, 0.9, 0, 0, 78, [["1 fillet", 180]], { sq: "Merluc", de: "Kabeljau" }],
  ["Rainbow trout, cooked", "fish", R, 168, 23.8, 0, 7.4, 0, 0, 61, [["1 fillet", 71]], { sq: "Troftë", de: "Forelle" }],
  ["Shrimp, cooked", "fish", R, 99, 24.0, 0.2, 0.3, 0, 0, 111, [["1 portion", 85]], { sq: "Karkaleca", de: "Garnelen" }],
  ["Egg, hard-boiled", "egg", R, 155, 12.6, 1.1, 10.6, 0, 1.1, 124, [["1 large", 50], ["1 medium", 44]], { sq: "Vezë e zier", de: "Ei, gekocht" }, { ironMg: 1.2, calciumMg: 50, vitAUg: 149, vitB12Ug: 1.1, folateUg: 44 }],
  ["Egg white, raw", "egg", R, 52, 10.9, 0.7, 0.2, 0, 0.7, 166, [["1 large white", 33]], { sq: "E bardhë veze", de: "Eiklar" }],
  ["Tofu, regular", "legume", R, 76, 8.1, 1.9, 4.8, 0.3, 0.6, 7, [["1 portion", 100]], { sq: "Tofu", de: "Tofu" }, { ironMg: 5.4 }],
  ["Lentils, cooked", "legume", R, 116, 9.0, 20.1, 0.4, 7.9, 1.8, 2, [["1 cup", 198]], { sq: "Thjerrëza, të ziera", de: "Linsen, gekocht" }, { ironMg: 3.3, potassiumMg: 369, folateUg: 181 }],
  ["Chickpeas, cooked", "legume", R, 164, 8.9, 27.4, 2.6, 7.6, 4.8, 7, [["1 cup", 164]], { sq: "Qiqra", de: "Kichererbsen, gekocht" }, { ironMg: 2.9, folateUg: 172 }],
  ["Kidney beans, cooked", "legume", R, 127, 8.7, 22.8, 0.5, 6.4, 0.3, 1, [["1 cup", 177]], { sq: "Fasule të kuqe", de: "Kidneybohnen" }],
  ["White beans (navy), cooked", "legume", R, 140, 8.2, 26.1, 0.6, 10.5, 0.4, 0, [["1 cup", 182]], { sq: "Fasule të bardha", de: "Weiße Bohnen" }],
  ["Black beans, cooked", "legume", R, 132, 8.9, 23.7, 0.5, 8.7, 0.3, 1, [["1 cup", 172]], { sq: "Fasule të zeza", de: "Schwarze Bohnen" }],
  ["Hummus", "spread", R, 166, 7.9, 14.3, 9.6, 6.0, 0.3, 379, [["2 tbsp", 30]], { sq: "Humus", de: "Hummus" }],
  // Dairy
  ["Milk, whole (3.25%)", "dairy", R, 61, 3.2, 4.8, 3.3, 0, 5.1, 43, [["1 glass", 250], ["1 cup", 244]], { sq: "Qumësht i plotë", de: "Vollmilch" }, { calciumMg: 113, vitB12Ug: 0.45 }],
  ["Milk, semi-skimmed (2%)", "dairy", R, 50, 3.3, 4.8, 2.0, 0, 5.1, 47, [["1 glass", 250]], { sq: "Qumësht 2%", de: "Milch 1,5–2 %" }, { calciumMg: 120 }],
  ["Milk, skim", "dairy", R, 34, 3.4, 5.0, 0.1, 0, 5.1, 42, [["1 glass", 250]], { sq: "Qumësht pa yndyrë", de: "Magermilch" }],
  ["Greek yogurt, plain, non-fat", "dairy", R, 59, 10.2, 3.6, 0.4, 0, 3.2, 36, [["1 pot", 170]], { sq: "Jogurt grek pa yndyrë", de: "Griechischer Joghurt, mager" }, { calciumMg: 110 }],
  ["Greek yogurt, plain, full-fat", "dairy", R, 97, 9.0, 4.0, 5.0, 0, 4.0, 35, [["1 pot", 170]], { sq: "Jogurt grek", de: "Griechischer Joghurt" }],
  ["Yogurt, plain, whole milk (kos)", "dairy", R, 61, 3.5, 4.7, 3.3, 0, 4.7, 46, [["1 cup", 245], ["1 pot", 150]], { sq: "Kos", de: "Naturjoghurt" }, { calciumMg: 121 }],
  ["Kefir, plain, low-fat", "dairy", R, 41, 3.8, 4.5, 0.9, 0, 4.6, 40, [["1 glass", 250]], { sq: "Kefir", de: "Kefir" }],
  ["Cheddar cheese", "dairy", R, 403, 24.9, 1.3, 33.1, 0, 0.5, 621, [["1 slice", 28]], { sq: "Djathë çedar", de: "Cheddar" }, { calciumMg: 721 }],
  ["Mozzarella, whole milk", "dairy", R, 300, 22.2, 2.2, 22.4, 0, 1.0, 627, [["1 slice", 28]], { sq: "Mocarela", de: "Mozzarella" }],
  ["Feta cheese", "dairy", R, 264, 14.2, 4.1, 21.3, 0, 4.1, 1116, [["1 portion", 30]], { sq: "Feta", de: "Feta" }, { calciumMg: 493 }],
  ["Cottage cheese (4% fat)", "dairy", R, 98, 11.1, 3.4, 4.3, 0, 2.7, 364, [["½ cup", 113]], { sq: "Gjizë", de: "Hüttenkäse" }],
  ["Butter, salted", "fat", R, 717, 0.9, 0.1, 81.1, 0, 0.1, 643, [["1 tsp", 5], ["1 tbsp", 14]], { sq: "Gjalpë", de: "Butter" }],
  ["Sour cream", "dairy", R, 198, 2.4, 4.6, 19.4, 0, 3.4, 31, [["1 tbsp", 12]], { sq: "Salcë kosi", de: "Saure Sahne" }],
  // Fats, nuts, seeds
  ["Olive oil", "fat", R, 884, 0, 0, 100, 0, 0, 2, [["1 tbsp", 13.5], ["1 tsp", 4.5]], { sq: "Vaj ulliri", de: "Olivenöl" }],
  ["Sunflower oil", "fat", R, 884, 0, 0, 100, 0, 0, 0, [["1 tbsp", 13.6]], { sq: "Vaj luledielli", de: "Sonnenblumenöl" }],
  ["Almonds", "nuts", R, 579, 21.2, 21.6, 49.9, 12.5, 4.4, 1, [["1 handful", 28]], { sq: "Bajame", de: "Mandeln" }, { calciumMg: 269, magnesiumMg: 270, ironMg: 3.7 }],
  ["Walnuts", "nuts", R, 654, 15.2, 13.7, 65.2, 6.7, 2.6, 2, [["1 handful", 28]], { sq: "Arra", de: "Walnüsse" }, { magnesiumMg: 158 }],
  ["Peanuts, dry-roasted, unsalted", "nuts", R, 585, 24.4, 21.3, 49.7, 8.0, 4.2, 6, [["1 handful", 28]], { sq: "Kikirikë", de: "Erdnüsse" }],
  ["Peanut butter, smooth", "spread", R, 588, 25.1, 19.6, 50.4, 6.0, 9.2, 426, [["1 tbsp", 16]], { sq: "Gjalpë kikiriku", de: "Erdnussbutter" }],
  ["Cashews, raw", "nuts", R, 553, 18.2, 30.2, 43.9, 3.3, 5.9, 12, [["1 handful", 28]], { sq: "Shqeme", de: "Cashewkerne" }],
  ["Chia seeds", "seeds", R, 486, 16.5, 42.1, 30.7, 34.4, 0, 16, [["1 tbsp", 12]], { sq: "Fara chia", de: "Chiasamen" }, { calciumMg: 631 }],
  ["Sunflower seeds", "seeds", R, 584, 20.8, 20.0, 51.5, 8.6, 2.6, 9, [["1 handful", 28]], { sq: "Fara luledielli", de: "Sonnenblumenkerne" }],
  ["Tahini", "spread", R, 595, 17.0, 21.2, 53.8, 9.3, 0.5, 115, [["1 tbsp", 15]], { sq: "Tahini", de: "Tahin" }],
  // Drinks (per 100 ml)
  ["Orange juice", "drink", R, 45, 0.7, 10.4, 0.2, 0.2, 8.4, 1, [["1 glass", 250]], { sq: "Lëng portokalli", de: "Orangensaft" }, { vitCMg: 50 }],
  ["Coffee, brewed, black", "drink", R, 1, 0.1, 0, 0, 0, 0, 2, [["1 cup", 240], ["1 espresso", 30]], { sq: "Kafe", de: "Kaffee" }],
  ["Tea, brewed, unsweetened", "drink", R, 1, 0, 0.3, 0, 0, 0, 3, [["1 cup", 240]], { sq: "Çaj", de: "Tee" }],
  ["Cola, regular", "drink", R, 42, 0, 10.6, 0, 0, 10.6, 4, [["1 can", 330]], { sq: "Kola", de: "Cola" }],
  ["Beer, regular", "drink", R, 43, 0.5, 3.6, 0, 0, 0, 4, [["1 bottle", 330], ["1 pint", 500]], { sq: "Birrë", de: "Bier" }],
  ["Wine, red", "drink", R, 85, 0.1, 2.6, 0, 0, 0.6, 4, [["1 glass", 150]], { sq: "Verë e kuqe", de: "Rotwein" }],
  // Sweets, snacks, condiments
  ["Dark chocolate (70–85%)", "sweets", R, 598, 7.8, 45.9, 42.6, 10.9, 24.0, 20, [["1 square", 10], ["1 bar", 100]], { sq: "Çokollatë e zezë", de: "Zartbitterschokolade" }, { ironMg: 11.9, magnesiumMg: 228 }],
  ["Milk chocolate", "sweets", R, 535, 7.7, 59.4, 29.7, 3.4, 51.5, 79, [["1 bar", 45]], { sq: "Çokollatë qumështi", de: "Milchschokolade" }],
  ["Potato chips", "snack", R, 536, 7.0, 53.0, 34.6, 4.4, 0.3, 525, [["1 small bag", 28]], { sq: "Çips", de: "Kartoffelchips" }],
  ["Honey", "sweets", R, 304, 0.3, 82.4, 0, 0.2, 82.1, 4, [["1 tbsp", 21], ["1 tsp", 7]], { sq: "Mjaltë", de: "Honig" }],
  ["Sugar, white", "sweets", R, 387, 0, 100, 0, 0, 100, 1, [["1 tsp", 4]], { sq: "Sheqer", de: "Zucker" }],
  ["Jam", "sweets", R, 278, 0.4, 68.9, 0.1, 1.1, 48.5, 32, [["1 tbsp", 20]], { sq: "Reçel", de: "Marmelade" }],
  ["Ketchup", "condiment", R, 101, 1.0, 27.4, 0.1, 0.3, 21.3, 907, [["1 tbsp", 17]], { sq: "Keçap", de: "Ketchup" }],
  ["Mayonnaise", "condiment", R, 680, 1.0, 0.6, 75.0, 0, 0.6, 635, [["1 tbsp", 14]], { sq: "Majonezë", de: "Mayonnaise" }],
  ["French fries (restaurant)", "fast-food", R, 312, 3.4, 41.4, 14.7, 3.8, 0.3, 210, [["medium portion", 117]], { sq: "Patate të skuqura", de: "Pommes frites" }],
  ["Cheese pizza (typical)", "fast-food", R, 266, 11.4, 33.3, 9.7, 2.3, 3.6, 598, [["1 slice", 107]], { sq: "Pica me djathë", de: "Käsepizza" }],
];

// Composite / regional dishes — ESTIMATES (recipes vary). Shown with an "estimate" badge.
export const ESTIMATE_ROWS: Row[] = [
  ["Byrek me spinaq (spinach & cheese burek)", "balkan-dish", B, 260, 8, 24, 15, 1.8, 1.2, 450, [["1 slice", 150]], { sq: "Byrek me spinaq", de: "Burek mit Spinat" }],
  ["Byrek me mish (meat burek)", "balkan-dish", B, 290, 11, 23, 17, 1.2, 1, 450, [["1 slice", 150]], { sq: "Byrek me mish", de: "Burek mit Fleisch" }],
  ["Byrek me djathë (cheese burek)", "balkan-dish", B, 300, 10.5, 25, 18, 1, 1.5, 550, [["1 slice", 150]], { sq: "Byrek me djathë", de: "Burek mit Käse" }],
  ["Flija", "balkan-dish", B, 330, 7, 28, 21, 1, 2, 250, [["1 slice", 150]], { sq: "Flija", de: "Flija (Schichtgebäck)" }],
  ["Tavë kosi (baked lamb with yogurt)", "balkan-dish", B, 160, 11, 6, 10.5, 0.3, 2.5, 300, [["1 portion", 300]], { sq: "Tavë kosi", de: "Tavë Kosi (Lamm mit Joghurt)" }],
  ["Qebapa / ćevapi (grilled minced meat)", "balkan-dish", B, 260, 18, 2, 20, 0, 0.5, 600, [["5 pieces", 150], ["10 pieces", 300]], { sq: "Qebapa", de: "Ćevapčići" }],
  ["Pite me kungull (pumpkin pie)", "balkan-dish", B, 220, 4.5, 30, 9.5, 1.8, 10, 250, [["1 slice", 150]], { sq: "Pite me kungull", de: "Kürbispita" }],
  ["Fasule / pasul (bean stew)", "balkan-dish", B, 110, 6, 15, 3, 5, 1.5, 300, [["1 bowl", 300]], { sq: "Fasule", de: "Bohneneintopf" }],
  ["Speca të mbushura (stuffed peppers)", "balkan-dish", B, 110, 6, 9, 5.5, 1.6, 3, 300, [["1 pepper", 200]], { sq: "Speca të mbushura", de: "Gefüllte Paprika" }],
  ["Sarma (stuffed cabbage rolls)", "balkan-dish", B, 140, 7, 9, 8.5, 1.8, 1.5, 450, [["2 rolls", 200]], { sq: "Sarma", de: "Sarma (Kohlrouladen)" }],
  ["Musaka (potato & minced meat bake)", "balkan-dish", B, 150, 7.5, 10, 9, 1.3, 2, 300, [["1 portion", 300]], { sq: "Musaka", de: "Moussaka" }],
  ["Fërgesë (peppers, tomato & cottage cheese)", "balkan-dish", B, 160, 7, 6, 12, 1.2, 4, 450, [["1 portion", 200]], { sq: "Fërgesë", de: "Fërgesë" }],
  ["Bakllava (baklava)", "balkan-dish", B, 430, 6.5, 42, 27, 2.5, 22, 240, [["1 piece", 60]], { sq: "Bakllava", de: "Baklava" }],
  ["Trileçe (tres leches cake)", "balkan-dish", B, 260, 6, 35, 11, 0.3, 28, 120, [["1 piece", 150]], { sq: "Trileçe", de: "Trileçe" }],
  ["Djathë i bardhë (white brined cheese)", "dairy", B, 260, 15, 2, 21, 0, 1, 1100, [["1 portion", 30]], { sq: "Djathë i bardhë", de: "Weißer Salzlakenkäse" }],
  ["Ajvar (roasted pepper relish)", "spread", B, 90, 1.5, 9, 5, 2.5, 7, 600, [["2 tbsp", 30]], { sq: "Ajvar", de: "Ajvar" }],
  ["Pogaçe (homemade bread)", "bread", B, 290, 8.5, 48, 7, 2, 3, 500, [["1 piece", 80]], { sq: "Pogaçe", de: "Pogača (Brot)" }],
  ["Kaçamak (cornmeal with cheese/butter)", "balkan-dish", B, 150, 4, 18, 7, 1.2, 0.5, 250, [["1 bowl", 250]], { sq: "Kaçamak", de: "Kačamak (Maisbrei)" }],
  ["Turshi (pickled vegetables)", "balkan-dish", B, 20, 0.8, 4, 0.2, 1.5, 2, 1000, [["1 portion", 80]], { sq: "Turshi", de: "Eingelegtes Gemüse" }],
  ["Japrak (stuffed vine leaves)", "balkan-dish", B, 170, 4, 17, 9.5, 3, 1.5, 400, [["5 pieces", 100]], { sq: "Japrak", de: "Gefüllte Weinblätter" }],
  ["Tarator (yogurt & cucumber)", "balkan-dish", B, 55, 3, 4, 2.8, 0.4, 3.5, 200, [["1 bowl", 200]], { sq: "Tarator", de: "Tarator" }],
  ["Llokuma (fried dough)", "balkan-dish", B, 330, 7, 42, 15, 1.5, 3, 350, [["3 pieces", 90]], { sq: "Llokuma", de: "Lokum (Krapfen)" }],
  ["Ayran / dhallë (yogurt drink)", "drink", B, 37, 1.7, 2.5, 2.0, 0, 2.5, 230, [["1 glass", 250]], { sq: "Dhallë", de: "Ayran" }],
  ["Spaghetti bolognese", "dish", R, 150, 7.5, 18, 5, 1.5, 2.5, 280, [["1 plate", 350]], { sq: "Shpageta bolonjeze", de: "Spaghetti Bolognese" }],
  ["Doner kebab / sufllaqe", "fast-food", R, 230, 13, 20, 11, 1.5, 2, 550, [["1 wrap", 300]], { sq: "Sufllaqe", de: "Döner Kebab" }],
  ["Falafel", "dish", R, 333, 13.3, 31.8, 17.8, 4.9, null, 294, [["4 pieces", 68]], { sq: "Falafel", de: "Falafel" }],
  ["Chicken shawarma wrap", "fast-food", R, 210, 12, 20, 9, 1.5, 2, 500, [["1 wrap", 300]], { sq: "Shaurma pule", de: "Hähnchen-Shawarma" }],
  ["Sushi maki roll (typical)", "dish", R, 150, 5, 28, 2, 1, 4, 400, [["6 pieces", 150]], { sq: "Sushi", de: "Sushi Maki" }],
  ["Pad thai (typical)", "dish", R, 180, 7, 22, 7, 1.5, 6, 500, [["1 plate", 350]], { sq: "Pad thai", de: "Pad Thai" }],
  ["Pancakes, plain", "bakery", R, 227, 6.4, 28.3, 9.7, null, 5.4, 439, [["1 pancake", 40]], { sq: "Petulla", de: "Pfannkuchen" }],
];

export type CatalogFood = {
  name: string;
  category: string;
  region: string;
  quality: "reference" | "estimate";
  per100: Record<string, number | null>;
  servings: { label: string; grams: number }[];
  localNames?: { sq?: string; de?: string };
  isLiquid: boolean;
};

export function catalogFoods(): CatalogFood[] {
  const toFood = (row: Row, quality: "reference" | "estimate"): CatalogFood => {
    const [name, category, region, kcal, proteinG, carbsG, fatG, fiberG, sugarG, sodiumMg, servings, local, micros] = row;
    return {
      name,
      category,
      region,
      quality,
      per100: {
        kcal,
        proteinG,
        carbsG,
        fatG,
        fiberG,
        sugarG,
        sodiumMg,
        ironMg: micros?.ironMg ?? null,
        calciumMg: micros?.calciumMg ?? null,
        potassiumMg: micros?.potassiumMg ?? null,
        magnesiumMg: micros?.magnesiumMg ?? null,
        vitAUg: micros?.vitAUg ?? null,
        vitCMg: micros?.vitCMg ?? null,
        vitDUg: micros?.vitDUg ?? null,
        vitB12Ug: micros?.vitB12Ug ?? null,
        folateUg: micros?.folateUg ?? null,
      },
      servings: servings.map(([label, grams]) => ({ label, grams })),
      localNames: local,
      isLiquid: category === "drink",
    };
  };
  return [...REFERENCE_ROWS.map((r) => toFood(r, "reference")), ...ESTIMATE_ROWS.map((r) => toFood(r, "estimate"))];
}

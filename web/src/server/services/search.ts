import "server-only";
import { db } from "../db";
import { normalize } from "@/lib/text";
import { SPORTS } from "@/lib/sports";
import { searchFoods } from "./food";
import { listRecipes } from "./recipes";
import { listExercises, listTemplates } from "./fitness";
import { listConversations } from "../ai/chat";

/** Global search across the user's data and the shared catalogues. */
export async function globalSearch(userId: string, q: string) {
  const nq = normalize(q);
  if (nq.length < 2) return { query: q, groups: [] };
  const [foods, recipes, exercises, templates, meals, goals, convs] = await Promise.all([
    searchFoods(userId, q, 6),
    listRecipes(userId, q),
    listExercises(userId, { q }),
    listTemplates(userId),
    db.foodLogEntry.findMany({ where: { userId }, orderBy: { loggedAt: "desc" }, take: 500, select: { name: true, date: true, mealType: true } }),
    db.goal.findMany({ where: { userId, status: { not: "archived" } } }),
    listConversations(userId, q),
  ]);
  const seen = new Set<string>();
  const previousMeals = meals
    .filter((m) => normalize(m.name).includes(nq) && !seen.has(m.name) && seen.add(m.name))
    .slice(0, 6)
    .map((m) => ({ title: m.name, subtitle: `Last logged ${m.date} · ${m.mealType}`, href: `/nutrition?date=${m.date}` }));
  const groups = [
    { key: "foods", label: "Foods", items: foods.map((f) => ({ title: f.name, subtitle: [f.brand, `${f.per100.kcal ?? "?"} kcal/100 g`].filter(Boolean).join(" · "), href: `/nutrition/food/${f.id}` })) },
    { key: "previous_meals", label: "Previously logged", items: previousMeals },
    { key: "recipes", label: "Recipes", items: recipes.slice(0, 6).map((r) => ({ title: r.name, subtitle: `${r.perServing.kcal} kcal per serving`, href: `/nutrition/recipes/${r.id}` })) },
    { key: "exercises", label: "Exercises", items: exercises.slice(0, 6).map((e) => ({ title: e.name, subtitle: e.muscleGroups.join(", "), href: `/workout/exercises/${e.slug}` })) },
    { key: "workouts", label: "Workout plans", items: templates.filter((t) => normalize(t.name).includes(nq)).slice(0, 6).map((t) => ({ title: t.name, subtitle: `${t.exerciseCount} exercises`, href: `/workout/plans/${t.id}` })) },
    { key: "sports", label: "Sports", items: Object.entries(SPORTS).filter(([k, s]) => normalize(`${k} ${s.label}`).includes(nq)).map(([k, s]) => ({ title: `${s.emoji} ${s.label}`, subtitle: "Log an activity", href: `/activity/new?type=${k}` })) },
    { key: "goals", label: "Goals", items: goals.filter((g) => normalize(g.title).includes(nq)).map((g) => ({ title: g.title, subtitle: g.status, href: "/progress/goals" })) },
    { key: "conversations", label: "AI conversations", items: convs.slice(0, 6).map((c) => ({ title: c.title, subtitle: new Date(c.updatedAt).toLocaleDateString(), href: `/coach?c=${c.id}` })) },
  ].filter((g) => g.items.length);
  return { query: q, groups };
}

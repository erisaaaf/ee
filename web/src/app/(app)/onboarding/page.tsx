"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/components/me";
import { Alert, Button, Card, Chips, Field, Input, Select, TagInput, Toggle } from "@/components/ui";
import { ALLERGENS, DIET_PATTERNS, EQUIPMENT, GOAL_OPTIONS } from "@/lib/validation";
import { ftInToCm, lbToKg } from "@/lib/units";
import { SPORTS } from "@/lib/sports";

const STEPS = ["About you", "Goals", "Fitness", "Food", "Lifestyle"] as const;

export default function OnboardingPage() {
  const { me, mutate } = useMe();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — basics (all optional)
  const [name, setName] = useState(me.name ?? "");
  const [units, setUnits] = useState(me.profile.units);
  const [birthYear, setBirthYear] = useState(me.profile.birthYear?.toString() ?? "");
  const [sex, setSex] = useState(me.profile.sex ?? "");
  const [height, setHeight] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");
  const [activityLevel, setActivity] = useState(me.profile.activityLevel ?? "");
  const [experience, setExperience] = useState(me.profile.experience ?? "beginner");
  const [country, setCountry] = useState(me.profile.country ?? "");
  // Step 2
  const [goals, setGoals] = useState<string[]>(me.preferences.goals);
  // Step 3
  const [gymAccess, setGym] = useState(me.preferences.gymAccess);
  const [homeWorkouts, setHome] = useState(me.preferences.homeWorkouts);
  const [equipment, setEquipment] = useState<string[]>(me.preferences.equipment);
  const [days, setDays] = useState(me.preferences.workoutDaysPerWeek?.toString() ?? "3");
  const [duration, setDuration] = useState(me.preferences.workoutDurationMin?.toString() ?? "30");
  const [trainingDays, setTrainingDays] = useState<string[]>(me.preferences.trainingDays.map(String));
  const [limitations, setLimitations] = useState(me.preferences.limitations ?? "");
  // Step 4
  const [diet, setDiet] = useState(me.preferences.dietPattern);
  const [allergies, setAllergies] = useState<string[]>(me.preferences.allergies);
  const [dislikes, setDislikes] = useState<string[]>(me.preferences.dislikes);
  const [likes, setLikes] = useState<string[]>(me.preferences.likes);
  const [cookingSkill, setSkill] = useState(me.preferences.cookingSkill ?? "");
  const [mealsPerDay, setMeals] = useState(me.preferences.mealsPerDay?.toString() ?? "");
  const [budget, setBudget] = useState(me.preferences.budget ?? "");
  const [cookTime, setCookTime] = useState(me.preferences.cookingTimeMin?.toString() ?? "");
  // Step 5
  const [bedtime, setBedtime] = useState(me.preferences.bedtime ?? "");
  const [wakeTime, setWake] = useState(me.preferences.wakeTime ?? "");
  const [sports, setSports] = useState<string[]>(me.preferences.preferredSports);
  const [waterHabit, setWaterHabit] = useState(me.preferences.waterHabit ?? "");
  const [schedule, setSchedule] = useState(me.preferences.scheduleNotes ?? "");

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  async function saveStep(finish = false) {
    setSaving(true);
    setError(null);
    try {
      if (step === 0) {
        const h = units === "imperial" ? (height || heightIn ? ftInToCm(Number(height || 0), Number(heightIn || 0)) : null) : num(height);
        const w = units === "imperial" ? (weight ? lbToKg(Number(weight)) : null) : num(weight);
        await api.patch("/api/me/profile", {
          name: name || null,
          units,
          birthYear: num(birthYear),
          sex: sex || null,
          heightCm: h ? Math.round(h * 10) / 10 : null,
          weightKg: w ? Math.round(w * 10) / 10 : null,
          activityLevel: activityLevel || null,
          experience: experience || null,
          country: country || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      } else if (step === 1) {
        await api.patch("/api/me/preferences", { goals });
      } else if (step === 2) {
        await api.patch("/api/me/preferences", { gymAccess, homeWorkouts, equipment, workoutDaysPerWeek: num(days), workoutDurationMin: num(duration), trainingDays: trainingDays.map(Number), limitations: limitations || null });
      } else if (step === 3) {
        await api.patch("/api/me/preferences", { dietPattern: diet, allergies, dislikes, likes, cookingSkill: cookingSkill || null, mealsPerDay: num(mealsPerDay), budget: budget || null, cookingTimeMin: num(cookTime) });
      } else if (step === 4) {
        await api.patch("/api/me/preferences", { bedtime: bedtime || null, wakeTime: wakeTime || null, preferredSports: sports, waterHabit: waterHabit || null, scheduleNotes: schedule || null });
      }
      if (finish || step === STEPS.length - 1) {
        await api.post("/api/me/onboarding");
        await mutate();
        router.replace("/");
        return;
      }
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <p className="text-sm text-muted">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="text-2xl font-semibold">{STEPS[step]}</h1>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">Everything here is optional and can be changed later in Settings. Share only what you&apos;re comfortable with.</p>
      </div>

      <Card className="space-y-5 p-5">
        {step === 0 && (
          <>
            <Field label="What should we call you?" htmlFor="name" optional>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </Field>
            <Field label="Units" htmlFor="units">
              <Select id="units" value={units} onChange={(e) => setUnits(e.target.value as typeof units)}>
                <option value="metric">Metric (kg, cm, km, ml)</option>
                <option value="imperial">Imperial (lb, ft/in, miles, fl oz)</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Birth year" htmlFor="by" optional hint="Used for age-appropriate estimates.">
                <Input id="by" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="e.g. 1995" />
              </Field>
              <Field label="Sex" htmlFor="sex" optional hint="Only used for energy estimates.">
                <Select id="sex" value={sex} onChange={(e) => setSex(e.target.value)}>
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {units === "metric" ? (
                <Field label="Height (cm)" htmlFor="h" optional>
                  <Input id="h" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder={me.profile.heightCm?.toString() ?? ""} />
                </Field>
              ) : (
                <Field label="Height (ft / in)" htmlFor="h" optional>
                  <div className="flex gap-2">
                    <Input id="h" aria-label="Feet" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="ft" />
                    <Input aria-label="Inches" inputMode="numeric" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} placeholder="in" />
                  </div>
                </Field>
              )}
              <Field label={`Weight (${units === "metric" ? "kg" : "lb"})`} htmlFor="w" optional>
                <Input id="w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </Field>
            </div>
            <Field label="Daily activity" htmlFor="act" optional>
              <Select id="act" value={activityLevel} onChange={(e) => setActivity(e.target.value)}>
                <option value="">Not sure</option>
                <option value="sedentary">Mostly sitting</option>
                <option value="light">Lightly active</option>
                <option value="moderate">Moderately active (exercise 3–5 days)</option>
                <option value="active">Very active (6–7 days)</option>
                <option value="very_active">Extremely active (physical job + training)</option>
              </Select>
            </Field>
            <Field label="Fitness experience" htmlFor="exp">
              <Select id="exp" value={experience} onChange={(e) => setExperience(e.target.value)}>
                <option value="beginner">Beginner — new or returning</option>
                <option value="intermediate">Intermediate — train regularly</option>
                <option value="advanced">Advanced — track sets, loads, progression</option>
              </Select>
            </Field>
            <Field label="Country / region" htmlFor="country" optional hint="Helps suggest local foods.">
              <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} placeholder="e.g. Kosovo" />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <p className="text-sm text-muted">Pick as many as you like. You can change these any time.</p>
            <Chips label="Goals" options={GOAL_OPTIONS.map((g) => ({ value: g.key, label: g.label }))} value={goals} onChange={setGoals} />
            {goals.includes("body_composition") && (
              <Alert tone="info">We focus on gradual, sustainable changes. We never suggest extreme diets — and for people under 18 we don&apos;t suggest eating less than you need.</Alert>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Toggle label="I have gym access" checked={gymAccess} onChange={setGym} />
            <Toggle label="I'd like home workouts" checked={homeWorkouts} onChange={setHome} />
            <Field label="Equipment I have at home">
              <Chips label="Equipment" options={EQUIPMENT.map((e) => ({ value: e.key, label: e.label }))} value={equipment} onChange={setEquipment} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Workouts per week" htmlFor="days">
                <Select id="days" value={days} onChange={(e) => setDays(e.target.value)}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Usual workout length" htmlFor="dur">
                <Select id="dur" value={duration} onChange={(e) => setDuration(e.target.value)}>
                  {[15, 20, 30, 45, 60, 90].map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Preferred training days" optional>
              <Chips label="Training days" options={["1", "2", "3", "4", "5", "6", "0"].map((d) => ({ value: d, label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][Number(d)] }))} value={trainingDays} onChange={setTrainingDays} />
            </Field>
            <Field label="Anything we should be careful with?" htmlFor="lim" optional hint="E.g. 'sore left knee' or 'avoid jumping'. Stored encrypted. We'll avoid exercises that load these areas — this isn't medical advice.">
              <Input id="lim" value={limitations} onChange={(e) => setLimitations(e.target.value)} maxLength={1000} />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <Field label="Eating pattern">
              <Chips label="Diet" multiple={false} options={DIET_PATTERNS.map((d) => ({ value: d.key, label: d.label }))} value={[diet]} onChange={(v) => setDiet(v[0])} />
            </Field>
            <Field label="Allergies or intolerances" hint="We treat these as strict safety rules in meal suggestions.">
              <Chips label="Common allergens" options={ALLERGENS.map((a) => ({ value: a, label: a.replace("_", " ") }))} value={allergies.filter((a) => (ALLERGENS as readonly string[]).includes(a))} onChange={(v) => setAllergies([...v, ...allergies.filter((a) => !(ALLERGENS as readonly string[]).includes(a))])} />
              <div className="mt-2">
                <TagInput label="Other allergy" placeholder="Add another (e.g. kiwi)" value={allergies.filter((a) => !(ALLERGENS as readonly string[]).includes(a))} onChange={(v) => setAllergies([...allergies.filter((a) => (ALLERGENS as readonly string[]).includes(a)), ...v])} />
              </div>
            </Field>
            <Field label="Foods you like" optional>
              <TagInput label="Foods you like" placeholder="e.g. lentils" value={likes} onChange={setLikes} />
            </Field>
            <Field label="Foods you don't like" optional>
              <TagInput label="Foods you dislike" placeholder="e.g. mushrooms" value={dislikes} onChange={setDislikes} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cooking skill" htmlFor="skill" optional>
                <Select id="skill" value={cookingSkill} onChange={(e) => setSkill(e.target.value)}>
                  <option value="">—</option>
                  <option value="basic">Basic</option>
                  <option value="intermediate">Comfortable</option>
                  <option value="confident">Confident</option>
                </Select>
              </Field>
              <Field label="Meals per day" htmlFor="meals" optional>
                <Select id="meals" value={mealsPerDay} onChange={(e) => setMeals(e.target.value)}>
                  <option value="">—</option>
                  {[2, 3, 4, 5, 6].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Budget" htmlFor="budget" optional>
                <Select id="budget" value={budget} onChange={(e) => setBudget(e.target.value)}>
                  <option value="">—</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="flexible">Flexible</option>
                </Select>
              </Field>
              <Field label="Cooking time" htmlFor="ct" optional>
                <Select id="ct" value={cookTime} onChange={(e) => setCookTime(e.target.value)}>
                  <option value="">—</option>
                  {[10, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      Up to {m} min
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Usual bedtime" htmlFor="bed" optional>
                <Input id="bed" type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
              </Field>
              <Field label="Usual wake time" htmlFor="wake" optional>
                <Input id="wake" type="time" value={wakeTime} onChange={(e) => setWake(e.target.value)} />
              </Field>
            </div>
            <Field label="Sports you enjoy" optional>
              <Chips label="Sports" options={Object.entries(SPORTS).filter(([k]) => k !== "custom").map(([k, s]) => ({ value: k, label: `${s.emoji} ${s.label}` }))} value={sports} onChange={setSports} />
            </Field>
            <Field label="Water habits" htmlFor="water" optional>
              <Select id="water" value={waterHabit} onChange={(e) => setWaterHabit(e.target.value)}>
                <option value="">—</option>
                <option value="rarely">I often forget to drink</option>
                <option value="sometimes">Sometimes</option>
                <option value="regularly">I drink regularly</option>
              </Select>
            </Field>
            <Field label="Anything about your schedule?" htmlFor="sched" optional>
              <Input id="sched" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="e.g. shift work, busy mornings" maxLength={500} />
            </Field>
          </>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button variant="ghost" onClick={() => (step === 0 ? saveStep(true) : setStep((s) => s - 1))} disabled={saving}>
            {step === 0 ? "Skip setup" : "Back"}
          </Button>
          <div className="flex gap-2">
            {step > 0 && step < STEPS.length - 1 && (
              <Button variant="secondary" onClick={() => saveStep(true)} disabled={saving}>
                Finish later
              </Button>
            )}
            <Button onClick={() => saveStep()} loading={saving}>
              {step === STEPS.length - 1 ? "Finish" : "Continue"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

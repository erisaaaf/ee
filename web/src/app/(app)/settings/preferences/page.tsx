"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { ALLERGENS, DIET_PATTERNS, EQUIPMENT, GOAL_OPTIONS } from "@/lib/validation";
import { SPORTS } from "@/lib/sports";
import { useMe, type Me } from "@/components/me";
import { Alert, Button, Card, Chips, Field, Input, PageHeader, SectionTitle, Select, TagInput, Toggle, useFeedback } from "@/components/ui";

export default function PreferencesSettings() {
  const { me, mutate } = useMe();
  const { toast } = useFeedback();
  const p = me.preferences;
  const [goals, setGoals] = useState(p.goals);
  const [diet, setDiet] = useState(p.dietPattern);
  const [allergies, setAllergies] = useState(p.allergies);
  const [dislikes, setDislikes] = useState(p.dislikes);
  const [likes, setLikes] = useState(p.likes);
  const [cuisines, setCuisines] = useState(p.cuisines);
  const [budget, setBudget] = useState(p.budget ?? "");
  const [cookTime, setCookTime] = useState(p.cookingTimeMin?.toString() ?? "");
  const [skill, setSkill] = useState(p.cookingSkill ?? "");
  const [gym, setGym] = useState(p.gymAccess);
  const [home, setHome] = useState(p.homeWorkouts);
  const [equipment, setEquipment] = useState(p.equipment);
  const [days, setDays] = useState(p.workoutDaysPerWeek?.toString() ?? "");
  const [duration, setDuration] = useState(p.workoutDurationMin?.toString() ?? "");
  const [sports, setSports] = useState(p.preferredSports);
  const [limitations, setLimitations] = useState(p.limitations ?? "");
  const [bedtime, setBedtime] = useState(p.bedtime ?? "");
  const [wake, setWake] = useState(p.wakeTime ?? "");
  const [travel, setTravel] = useState(p.travelMode);
  const [gamification, setGamification] = useState(me.settings.gamification);
  const [busy, setBusy] = useState(false);
  const known = ALLERGENS as readonly string[];

  async function save() {
    setBusy(true);
    try {
      await api.patch<Me>("/api/me/preferences", {
        goals,
        dietPattern: diet,
        allergies,
        dislikes,
        likes,
        cuisines,
        budget: budget || null,
        cookingTimeMin: cookTime ? Number(cookTime) : null,
        cookingSkill: skill || null,
        gymAccess: gym,
        homeWorkouts: home,
        equipment,
        workoutDaysPerWeek: days ? Number(days) : null,
        workoutDurationMin: duration ? Number(duration) : null,
        preferredSports: sports,
        limitations: limitations || null,
        bedtime: bedtime || null,
        wakeTime: wake || null,
        travelMode: travel,
      });
      const updated = await api.patch<Me>("/api/me/settings", { gamification });
      await mutate(updated, false);
      toast({ tone: "success", text: "Preferences saved — plans and suggestions will use them from now on" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Goals & preferences" back="/settings" />
      <Card className="space-y-3">
        <SectionTitle>Goals</SectionTitle>
        <Chips label="Goals" options={GOAL_OPTIONS.map((g) => ({ value: g.key, label: g.label }))} value={goals} onChange={setGoals} />
        <Toggle label="Challenges, streaks & rewards" description="Turn off if you'd rather not see gamification." checked={gamification} onChange={setGamification} />
      </Card>
      <Card className="space-y-4">
        <SectionTitle>Food</SectionTitle>
        <Field label="Eating pattern">
          <Chips label="Diet" multiple={false} options={DIET_PATTERNS.map((d) => ({ value: d.key, label: d.label }))} value={[diet]} onChange={(v) => setDiet(v[0])} />
        </Field>
        <Field label="Allergies & intolerances" hint="Treated as strict safety rules by meal plans and the AI.">
          <Chips label="Allergens" options={ALLERGENS.map((a) => ({ value: a, label: a.replace("_", " ") }))} value={allergies.filter((a) => known.includes(a))} onChange={(v) => setAllergies([...v, ...allergies.filter((a) => !known.includes(a))])} />
          <div className="mt-2">
            <TagInput label="Other allergies" value={allergies.filter((a) => !known.includes(a))} onChange={(v) => setAllergies([...allergies.filter((a) => known.includes(a)), ...v])} placeholder="Add another" />
          </div>
        </Field>
        <Field label="Likes" optional>
          <TagInput label="Likes" value={likes} onChange={setLikes} />
        </Field>
        <Field label="Dislikes" optional>
          <TagInput label="Dislikes" value={dislikes} onChange={setDislikes} />
        </Field>
        <Field label="Cuisines" optional>
          <TagInput label="Cuisines" value={cuisines} onChange={setCuisines} placeholder="e.g. Albanian, Italian" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Budget" htmlFor="pb">
            <Select id="pb" value={budget} onChange={(e) => setBudget(e.target.value)}>
              <option value="">—</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="flexible">Flexible</option>
            </Select>
          </Field>
          <Field label="Cooking time" htmlFor="pct">
            <Select id="pct" value={cookTime} onChange={(e) => setCookTime(e.target.value)}>
              <option value="">—</option>
              {[10, 20, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  ≤ {m} min
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Skill" htmlFor="psk">
            <Select id="psk" value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">—</option>
              <option value="basic">Basic</option>
              <option value="intermediate">Comfortable</option>
              <option value="confident">Confident</option>
            </Select>
          </Field>
        </div>
      </Card>
      <Card className="space-y-4">
        <SectionTitle>Training</SectionTitle>
        <Toggle label="Gym access" checked={gym} onChange={setGym} />
        <Toggle label="Home workouts" checked={home} onChange={setHome} />
        <Field label="Home equipment">
          <Chips label="Equipment" options={EQUIPMENT.map((e) => ({ value: e.key, label: e.label }))} value={equipment} onChange={setEquipment} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Workouts / week" htmlFor="pd">
            <Input id="pd" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Usual length (min)" htmlFor="pdu">
            <Input id="pdu" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
        <Field label="Sports" optional>
          <Chips label="Sports" options={Object.entries(SPORTS).filter(([k]) => k !== "custom").map(([k, s]) => ({ value: k, label: `${s.emoji} ${s.label}` }))} value={sports} onChange={setSports} />
        </Field>
        <Field label="Movement limitations" htmlFor="plim" optional hint="Stored encrypted. Used to avoid exercises that load these areas. Not medical advice.">
          <Input id="plim" value={limitations} onChange={(e) => setLimitations(e.target.value)} maxLength={1000} />
        </Field>
        <Toggle label="Travel mode" description="Suggest equipment-free workouts and simple meals while you're away." checked={travel} onChange={setTravel} />
      </Card>
      <Card className="grid grid-cols-2 gap-3">
        <Field label="Usual bedtime" htmlFor="pbt">
          <Input id="pbt" type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} />
        </Field>
        <Field label="Usual wake time" htmlFor="pwt">
          <Input id="pwt" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
        </Field>
      </Card>
      {me.profile.isMinor && goals.includes("body_composition") && <Alert tone="info">For people under 18 we don&apos;t set calorie deficits. We&apos;ll focus on balanced meals and enjoyable activity.</Alert>}
      <Button size="lg" className="w-full" onClick={save} loading={busy}>
        Save preferences
      </Button>
    </div>
  );
}

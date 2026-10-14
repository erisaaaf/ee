"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from "@/lib/units";
import { useMe, type Me } from "@/components/me";
import { Alert, Button, Card, Field, Input, PageHeader, Select, useFeedback } from "@/components/ui";

export default function ProfileSettings() {
  const { me, mutate } = useMe();
  const { toast } = useFeedback();
  const p = me.profile;
  const [name, setName] = useState(me.name ?? "");
  const [units, setUnits] = useState(p.units);
  const [birthYear, setBirthYear] = useState(p.birthYear?.toString() ?? "");
  const [sex, setSex] = useState(p.sex ?? "");
  const ftin = p.heightCm ? cmToFtIn(p.heightCm) : null;
  const [heightCm, setHeightCm] = useState(p.heightCm?.toString() ?? "");
  const [ft, setFt] = useState(ftin?.ft.toString() ?? "");
  const [inch, setInch] = useState(ftin?.in.toString() ?? "");
  const [weight, setWeight] = useState(p.weightKg ? String(Math.round((p.units === "imperial" ? kgToLb(p.weightKg) : p.weightKg) * 10) / 10) : "");
  const [activity, setActivity] = useState(p.activityLevel ?? "");
  const [experience, setExperience] = useState(p.experience ?? "");
  const [country, setCountry] = useState(p.country ?? "");
  const [language, setLanguage] = useState(p.language);
  const [timezone, setTimezone] = useState(p.timezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const h = units === "imperial" ? (ft || inch ? ftInToCm(Number(ft || 0), Number(inch || 0)) : null) : heightCm ? Number(heightCm) : null;
    const w = weight ? (units === "imperial" ? lbToKg(Number(weight)) : Number(weight)) : null;
    try {
      const updated = await api.patch<Me>("/api/me/profile", {
        name: name || null,
        units,
        birthYear: birthYear ? Number(birthYear) : null,
        sex: sex || null,
        heightCm: h ? Math.round(h * 10) / 10 : null,
        weightKg: w ? Math.round(w * 10) / 10 : null,
        activityLevel: activity || null,
        experience: experience || null,
        country: country || null,
        language,
        timezone,
      });
      await mutate(updated, false);
      toast({ tone: "success", text: "Profile saved" });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Profile & units" back="/settings" />
      <Card className="space-y-4">
        <Field label="Name" htmlFor="n" optional>
          <Input id="n" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Units" htmlFor="u">
            <Select id="u" value={units} onChange={(e) => setUnits(e.target.value as typeof units)}>
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </Select>
          </Field>
          <Field label="Language" htmlFor="l" hint="Albanian and German cover the main navigation so far.">
            <Select id="l" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
              <option value="en">English</option>
              <option value="sq">Shqip</option>
              <option value="de">Deutsch</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birth year" htmlFor="b" optional>
            <Input id="b" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Field>
          <Field label="Sex" htmlFor="s" optional hint="Only used for energy estimates.">
            <Select id="s" value={sex} onChange={(e) => setSex(e.target.value)}>
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
              <Input id="h" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </Field>
          ) : (
            <Field label="Height (ft / in)" htmlFor="h" optional>
              <div className="flex gap-2">
                <Input id="h" aria-label="Feet" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} />
                <Input aria-label="Inches" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} />
              </div>
            </Field>
          )}
          <Field label={`Weight (${units === "metric" ? "kg" : "lb"})`} htmlFor="w" optional>
            <Input id="w" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Daily activity" htmlFor="a" optional>
            <Select id="a" value={activity} onChange={(e) => setActivity(e.target.value)}>
              <option value="">Not sure</option>
              <option value="sedentary">Mostly sitting</option>
              <option value="light">Lightly active</option>
              <option value="moderate">Moderately active</option>
              <option value="active">Very active</option>
              <option value="very_active">Extremely active</option>
            </Select>
          </Field>
          <Field label="Experience" htmlFor="e" optional>
            <Select id="e" value={experience} onChange={(e) => setExperience(e.target.value)}>
              <option value="">—</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country / region" htmlFor="c" optional>
            <Input id="c" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Time zone" htmlFor="tz" hint="Decides when your day starts and ends.">
            <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)}>
          Use this device&apos;s time zone
        </Button>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button size="lg" className="w-full" onClick={save} loading={busy}>
          Save
        </Button>
      </Card>
    </div>
  );
}

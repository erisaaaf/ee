"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/api";
import { passwordSchema } from "@/lib/validation";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState<"en" | "sq" | "de">("en");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const pwCheck = password ? passwordSchema.safeParse(password) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (pwCheck && !pwCheck.success) {
      setFieldErrors({ password: pwCheck.error.issues[0].message });
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/register", { name: name || undefined, email, password, language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      window.location.href = "/onboarding";
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setFieldErrors(Object.fromEntries((err.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
      }
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Create your account</h1>
      <p className="mb-5 text-sm text-muted">It takes about a minute. You choose what to share.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" htmlFor="name" optional>
          <Input id="name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters, with a letter and a number." error={fieldErrors.password}>
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pw-strength" />
        </Field>
        {password && (
          <p id="pw-strength" className={pwCheck?.success ? "text-xs text-success" : "text-xs text-muted"}>
            {pwCheck?.success ? "✓ Strong enough" : pwCheck?.error.issues[0].message}
          </p>
        )}
        <Field label="Language" htmlFor="language">
          <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value as typeof language)}>
            <option value="en">English</option>
            <option value="sq">Shqip (partial)</option>
            <option value="de">Deutsch (partial)</option>
          </Select>
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
        <p className="text-xs text-muted">
          By continuing you agree that Vitality provides general wellness information and is not a substitute for professional medical advice. See how we handle your data in the{" "}
          <Link href="/privacy-policy" className="underline">
            privacy notice
          </Link>
          .
        </p>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

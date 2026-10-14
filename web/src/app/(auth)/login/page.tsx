"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function safeNext(next: string | null) {
  // Only allow same-site relative paths (prevents open redirects).
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "2fa">("password");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (step === "password") {
        const r = await api.post<{ requires2fa: boolean }>("/api/auth/login", { email, password });
        if (r.requires2fa) {
          setStep("2fa");
          setLoading(false);
          return;
        }
      } else {
        await api.post("/api/auth/2fa", { code });
      }
      window.location.href = safeNext(params.get("next"));
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="mb-1 text-xl font-semibold">{step === "password" ? "Welcome back" : "Two-factor check"}</h1>
      <p className="mb-5 text-sm text-muted">{step === "password" ? "Sign in to continue." : "Enter the 6-digit code from your authenticator app."}</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {step === "password" ? (
          <>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Authentication code" htmlFor="code">
            <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          {step === "password" ? "Sign in" : "Verify"}
        </Button>
      </form>
      {step === "password" && (
        <div className="mt-5 flex flex-col gap-2 text-center text-sm">
          <Link href="/forgot-password" className="text-primary underline-offset-2 hover:underline">
            Forgot your password?
          </Link>
          <p className="text-muted">
            New here?{" "}
            <Link href="/register" className="font-medium text-primary underline-offset-2 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      )}
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, errorMessage } from "@/lib/api";
import { passwordSchema } from "@/lib/validation";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = passwordSchema.safeParse(password);
    if (!check.success) return setError(check.error.issues[0].message);
    if (password !== confirm) return setError("The passwords don't match.");
    setLoading(true);
    try {
      await api.post("/api/auth/reset", { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) return <Alert tone="danger" title="Missing reset link">Open the link from your email, or request a new one.</Alert>;
  return (
    <Card className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Choose a new password</h1>
      {done ? (
        <div className="space-y-4">
          <Alert tone="success" title="Password updated">For your security, you&apos;ve been signed out on all devices.</Alert>
          <Link href="/login" className="block text-center text-sm font-medium text-primary hover:underline">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" htmlFor="pw" hint="At least 10 characters, with a letter and a number.">
            <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Repeat new password" htmlFor="pw2">
            <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" className="w-full" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

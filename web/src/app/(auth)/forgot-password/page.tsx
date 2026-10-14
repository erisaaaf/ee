"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<null | { emailConfigured: boolean }>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      setDone(await api.post<{ emailConfigured: boolean }>("/api/auth/forgot", { email }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Reset your password</h1>
      {done ? (
        <div className="space-y-4">
          <Alert tone="success" title="Check your email">
            If an account exists for {email}, we&apos;ve sent a link to reset the password. It expires in 60 minutes.
          </Alert>
          {!done.emailConfigured && <Alert tone="warning">Email delivery isn&apos;t configured on this server, so the message may not arrive. Contact the administrator.</Alert>}
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
          <Link href="/login" className="block text-center text-sm text-muted hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </Card>
  );
}

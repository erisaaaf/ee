"use client";

import useSWR from "swr";
import { useState } from "react";
import { Laptop, LogOut } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { passwordSchema } from "@/lib/validation";
import { useMe } from "@/components/me";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, SectionTitle, Spinner, useFeedback } from "@/components/ui";

type Sess = { id: string; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean };

function describeUA(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export default function SecurityPage() {
  const { me, mutate } = useMe();
  const { toast, confirm } = useFeedback();
  const { data: sessions, mutate: mutateSessions } = useSWR<Sess[]>("/api/account/sessions");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [disablePw, setDisablePw] = useState("");
  const [tfBusy, setTfBusy] = useState(false);

  async function changePw() {
    const c = passwordSchema.safeParse(next);
    if (!c.success) return toast({ tone: "error", text: c.error.issues[0].message });
    setPwBusy(true);
    try {
      await api.post("/api/account/password", { currentPassword: cur, newPassword: next });
      setCur("");
      setNext("");
      mutateSessions();
      toast({ tone: "success", text: "Password changed. Other devices were signed out." });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setPwBusy(false);
    }
  }
  async function begin2fa() {
    setTfBusy(true);
    try {
      setSetup(await api.post("/api/account/2fa/setup"));
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setTfBusy(false);
    }
  }
  async function confirm2fa() {
    setTfBusy(true);
    try {
      await api.post("/api/account/2fa/confirm", { code });
      setSetup(null);
      setCode("");
      await mutate();
      toast({ tone: "success", text: "Two-factor authentication is on" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setTfBusy(false);
    }
  }
  async function disable2fa() {
    setTfBusy(true);
    try {
      await api.post("/api/account/2fa/disable", { password: disablePw });
      setDisablePw("");
      await mutate();
      toast({ tone: "success", text: "Two-factor authentication turned off" });
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
    } finally {
      setTfBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Security" back="/settings" />
      <Card className="space-y-3">
        <SectionTitle>Change password</SectionTitle>
        <Field label="Current password" htmlFor="cp">
          <Input id="cp" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="np" hint="At least 10 characters, with a letter and a number.">
          <Input id="np" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Button onClick={changePw} loading={pwBusy} disabled={!cur || !next}>
          Update password
        </Button>
      </Card>

      <Card className="space-y-3">
        <SectionTitle action={me.totpEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}>Two-factor authentication</SectionTitle>
        {me.totpEnabled ? (
          <>
            <p className="text-sm text-muted">You&apos;ll be asked for a code from your authenticator app when signing in.</p>
            <Field label="Password to turn it off" htmlFor="dp">
              <Input id="dp" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={disable2fa} loading={tfBusy} disabled={!disablePw}>
              Turn off two-factor
            </Button>
          </>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm">Scan this QR code with an authenticator app (e.g. Google Authenticator, 1Password, Aegis), then enter the 6-digit code.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="QR code for your authenticator app" className="size-48 rounded-xl bg-white p-2" />
            <p className="text-xs text-muted">
              Can&apos;t scan? Enter this key: <code className="break-all">{setup.secret}</code>
            </p>
            <Field label="6-digit code" htmlFor="tc">
              <Input id="tc" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Button onClick={confirm2fa} loading={tfBusy} disabled={code.length !== 6}>
              Turn on
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted">Add a second step when signing in, using an authenticator app.</p>
            <Button onClick={begin2fa} loading={tfBusy}>
              Set up two-factor
            </Button>
          </>
        )}
        <Alert tone="info">Fingerprint / Face ID sign-in (passkeys) and social sign-in (Google, Apple) aren&apos;t available in this version yet.</Alert>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Signed-in devices</SectionTitle>
        {!sessions ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Laptop className="size-5 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {describeUA(s.userAgent)} {s.current && <Badge tone="primary">This device</Badge>}
                  </p>
                  <p className="text-xs text-muted">Last active {new Date(s.lastSeenAt).toLocaleString()}</p>
                </div>
                {!s.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await api.del(`/api/account/sessions/${s.id}`);
                        mutateSessions();
                      } catch (e) {
                        toast({ tone: "error", text: errorMessage(e) });
                      }
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {sessions && sessions.length > 1 && (
          <Button
            variant="secondary"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              if (!(await confirm({ title: "Sign out of all other devices?", confirmLabel: "Sign out others" }))) return;
              try {
                await api.del("/api/account/sessions");
                mutateSessions();
                toast({ tone: "success", text: "Signed out of other devices" });
              } catch (e) {
                toast({ tone: "error", text: errorMessage(e) });
              }
            }}
          >
            Sign out everywhere else
          </Button>
        )}
      </Card>
    </div>
  );
}

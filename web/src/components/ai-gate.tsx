"use client";

import useSWR from "swr";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AiStatus } from "@/lib/client-types";
import { Alert, Spinner } from "./ui";

/** Renders children only when AI is configured on the server and enabled by the user; otherwise explains why. */
export function AiGate({ children, feature }: { children: ReactNode; feature: string }) {
  const { data, error } = useSWR<AiStatus>("/api/ai/status");
  if (error) return <Alert tone="danger">Couldn&apos;t check AI availability.</Alert>;
  if (!data) return <Spinner />;
  if (!data.configured)
    return (
      <Alert tone="warning" title={`${feature} needs AI, which isn't set up yet`}>
        This server has no AI provider configured (an administrator needs to add an <code>ANTHROPIC_API_KEY</code>). Everything else in the app works without it.
      </Alert>
    );
  if (!data.enabledByUser)
    return (
      <Alert tone="info" title="AI features are off">
        You turned AI off. You can turn it back on in <Link href="/settings/privacy">Privacy settings</Link>.
      </Alert>
    );
  return <>{children}</>;
}

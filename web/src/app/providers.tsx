"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { FeedbackProvider } from "@/components/ui";
import { fetcher } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, shouldRetryOnError: (err: { status?: number }) => !err?.status || err.status >= 500, errorRetryCount: 2 }}>
      <FeedbackProvider>{children}</FeedbackProvider>
    </SWRConfig>
  );
}

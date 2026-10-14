"use client";

// Browser-side API client. Errors carry the server's plain-language message; technical details stay in `details`.

export type Achievement = { key: string; title: string; description: string; icon: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const listeners = new Set<(a: Achievement[]) => void>();
export function onAchievements(fn: (a: Achievement[]) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "offline", "You seem to be offline. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  let json: { data?: T; error?: { code: string; message: string; details?: unknown }; achievements?: Achievement[] } | null = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(res.status, json?.error?.code ?? "error", json?.error?.message ?? "Something went wrong while loading your data. Please try again.", json?.error?.details);
  }
  if (json?.achievements?.length) listeners.forEach((l) => l(json!.achievements!));
  return (json?.data ?? (json as T)) as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body: unknown = {}) => request<T>("POST", url, body),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  del: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body),
};

/** SWR fetcher */
export const fetcher = <T,>(url: string) => api.get<T>(url);

export const newClientId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
}

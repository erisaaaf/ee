"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError, newClientId } from "@/lib/api";

// Offline outbox. Only endpoints that accept a `clientId` idempotency key are queued, so a replay after
// reconnecting can never create duplicates (the server returns the existing record instead).
const KEY = "vt_outbox_v1";
type Item = { id: string; url: string; body: Record<string, unknown>; label: string; queuedAt: number };

function read(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Item[];
  } catch {
    return [];
  }
}
function write(items: Item[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable (private mode) — queue just won't persist */
  }
  listeners.forEach((l) => l());
}
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function useOutbox() {
  return useSyncExternalStore(subscribe, () => localStorage.getItem(KEY) ?? "[]", () => "[]");
}

/**
 * POST that works offline: sends now if possible, otherwise queues for later.
 * Returns { queued: true } when stored for later sync.
 */
export async function postOrQueue<T>(url: string, body: Record<string, unknown>, label: string): Promise<{ queued: false; data: T } | { queued: true }> {
  const withId = { clientId: newClientId(), ...body };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    write([...read(), { id: withId.clientId as string, url, body: withId, label, queuedAt: Date.now() }]);
    return { queued: true };
  }
  try {
    return { queued: false, data: await api.post<T>(url, withId) };
  } catch (e) {
    if (e instanceof ApiError && e.code === "offline") {
      write([...read(), { id: withId.clientId as string, url, body: withId, label, queuedAt: Date.now() }]);
      return { queued: true };
    }
    throw e;
  }
}

let flushing = false;
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing || !navigator.onLine) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0;
  let failed = 0;
  try {
    for (const item of read()) {
      try {
        await api.post(item.url, item.body);
        sent++;
        write(read().filter((x) => x.id !== item.id));
      } catch (e) {
        if (e instanceof ApiError && e.code === "offline") break; // still offline — try later
        // A validation error won't succeed on retry; drop it so it doesn't block the queue.
        failed++;
        write(read().filter((x) => x.id !== item.id));
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

/** Mount once: flushes the outbox on load and whenever the connection returns; registers the service worker. */
export function OfflineSync({ onSynced }: { onSynced?: (r: { sent: number; failed: number }) => void }) {
  useEffect(() => {
    const run = () => flushOutbox().then((r) => (r.sent || r.failed) && onSynced?.(r));
    run();
    window.addEventListener("online", run);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => window.removeEventListener("online", run);
  }, [onSynced]);
  return null;
}

export function clearOfflineData() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pause, Play, Square } from "lucide-react";
import { api, errorMessage, newClientId } from "@/lib/api";
import { localToday } from "@/lib/dates";
import { SPORTS } from "@/lib/sports";
import { formatDistance, formatPace, formatSpeed, haversineM } from "@/lib/units";
import { useMe } from "@/components/me";
import { RouteSketch } from "@/components/route-sketch";
import { Alert, Button, Card, Field, PageHeader, Select, Stat, useFeedback } from "@/components/ui";

type Pt = [number, number, number, number | null];

export default function TrackPage() {
  const { units } = useMe();
  const router = useRouter();
  const { toast } = useFeedback();
  const [type, setType] = useState("running");
  const [state, setState] = useState<"idle" | "consent" | "running" | "paused" | "done">("idle");
  const [points, setPoints] = useState<Pt[]>([]);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const watchId = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  const pausedTotal = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (state !== "running") return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current - pausedTotal.current), 1000);
    return () => clearInterval(t);
  }, [state]);
  useEffect(() => () => stopWatch(), []);

  function stopWatch() {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }

  function startWatch() {
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setAccuracy(Math.round(pos.coords.accuracy));
        if (pos.coords.accuracy > 50) return; // ignore poor fixes rather than invent distance
        const p: Pt = [pos.coords.latitude, pos.coords.longitude, pos.timestamp, pos.coords.altitude ?? null];
        setPoints((prev) => {
          const last = prev[prev.length - 1];
          if (last) {
            const d = haversineM(last[0], last[1], p[0], p[1]);
            if (d < 3) return prev; // jitter
            if (d < 100) setDistance((x) => x + d);
          }
          return [...prev, p];
        });
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? "Location permission was denied. You can still log this activity manually." : "We couldn't get a GPS signal. Try moving outdoors.");
        if (err.code === err.PERMISSION_DENIED) {
          stopWatch();
          setState("idle");
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  async function begin() {
    setError(null);
    if (!("geolocation" in navigator)) return setError("GPS isn't available on this device or browser. Log the activity manually instead.");
    startedAt.current = Date.now();
    pausedTotal.current = 0;
    setPoints([]);
    setDistance(0);
    setElapsed(0);
    setState("running");
    startWatch();
    try {
      wakeLock.current = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
    } catch {
      /* optional */
    }
  }
  function pause() {
    stopWatch();
    pausedAt.current = Date.now();
    setState("paused");
  }
  function resume() {
    if (pausedAt.current) pausedTotal.current += Date.now() - pausedAt.current;
    pausedAt.current = null;
    setState("running");
    startWatch();
  }
  function finish() {
    stopWatch();
    if (pausedAt.current) pausedTotal.current += Date.now() - pausedAt.current;
    setElapsed(Date.now() - startedAt.current - pausedTotal.current);
    setState("done");
  }
  async function save() {
    setSaving(true);
    try {
      const a = await api.post<{ id: string }>("/api/activities", {
        type,
        date: localToday(),
        startedAt: new Date(startedAt.current).toISOString(),
        durationMin: Math.max(1, Math.round(elapsed / 60000)),
        source: "gps",
        route: points,
        clientId: newClientId(),
      });
      toast({ tone: "success", text: "Activity saved" });
      router.push(`/activity/${a.id}`);
    } catch (e) {
      toast({ tone: "error", text: errorMessage(e) });
      setSaving(false);
    }
  }

  const mins = elapsed / 60000;
  const gpsSports = Object.entries(SPORTS).filter(([, s]) => s.gps);
  return (
    <div className="space-y-4">
      <PageHeader title="GPS tracking" back="/activity" />
      {state === "idle" && (
        <Card className="space-y-4">
          <Field label="Activity" htmlFor="tt">
            <Select id="tt" value={type} onChange={(e) => setType(e.target.value)}>
              {gpsSports.map(([k, s]) => (
                <option key={k} value={k}>
                  {s.emoji} {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Alert tone="info" title="Why we need your location">
            GPS is used only while you&apos;re tracking, to measure your route, distance, pace and elevation. The route stays on this device until you choose to save it, and it&apos;s never shared. Keep this screen open while tracking — browsers may pause GPS in the background.
          </Alert>
          {error && <Alert tone="warning">{error}</Alert>}
          <Button size="lg" className="w-full" onClick={begin} icon={<MapPin className="size-4" />}>
            Allow location & start
          </Button>
        </Card>
      )}
      {state !== "idle" && (
        <Card className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Time" value={`${Math.floor(mins / 60) ? `${Math.floor(mins / 60)}:` : ""}${String(Math.floor(mins % 60)).padStart(2, "0")}:${String(Math.floor((elapsed / 1000) % 60)).padStart(2, "0")}`} />
            <Stat label="Distance" value={formatDistance(distance, units)} />
            <Stat label={type === "cycling" || type === "skiing" ? "Speed" : "Pace"} value={type === "cycling" || type === "skiing" ? formatSpeed(distance, mins, units) : formatPace(distance, mins, units)} />
          </div>
          <p className="text-center text-xs text-muted">
            {state === "running" ? (accuracy != null ? `GPS accuracy ±${accuracy} m${accuracy > 50 ? " — waiting for a better signal" : ""}` : "Waiting for GPS…") : state === "paused" ? "Paused" : `${points.length} GPS points recorded`}
          </p>
          {error && <Alert tone="warning">{error}</Alert>}
          {points.length > 1 && <RouteSketch points={points} />}
          <div className="flex gap-2">
            {state === "running" && (
              <Button variant="secondary" className="flex-1" onClick={pause} icon={<Pause className="size-4" />}>
                Pause
              </Button>
            )}
            {state === "paused" && (
              <Button variant="secondary" className="flex-1" onClick={resume} icon={<Play className="size-4" />}>
                Resume
              </Button>
            )}
            {(state === "running" || state === "paused") && (
              <Button variant="danger" className="flex-1" onClick={finish} icon={<Square className="size-4" />}>
                Finish
              </Button>
            )}
          </div>
          {state === "done" && (
            <div className="space-y-2">
              {points.length < 2 ? (
                <Alert tone="warning" title="Not enough GPS points">No route was recorded, so there&apos;s nothing to save as a GPS activity. You can log it manually instead.</Alert>
              ) : (
                <Button size="lg" className="w-full" onClick={save} loading={saving}>
                  Save activity
                </Button>
              )}
              <Button variant="ghost" className="w-full" onClick={() => setState("idle")}>
                Discard
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

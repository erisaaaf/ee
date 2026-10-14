"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, CameraOff, Keyboard } from "lucide-react";
import type { IScannerControls } from "@zxing/browser";
import { api, errorMessage } from "@/lib/api";
import { localToday } from "@/lib/dates";
import type { Barcode, Food } from "@/lib/client-types";
import { FoodLogSheet } from "@/components/food-log-sheet";
import { Alert, Button, Card, Field, Input, LinkButton, PageHeader, Spinner } from "@/components/ui";

function Scanner() {
  const date = useSearchParams().get("date") ?? localToday();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controls = useRef<IScannerControls | null>(null);
  const handled = useRef(false);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "denied" | "unavailable">("idle");
  const [manual, setManual] = useState("");
  const [lookup, setLookup] = useState<Barcode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [food, setFood] = useState<Food | null>(null);

  useEffect(() => () => controls.current?.stop(), []);

  async function check(code: string) {
    setLoading(true);
    setError(null);
    setLookup(null);
    try {
      const r = await api.post<Barcode>("/api/foods/barcode", { code });
      setLookup(r);
      if (r.status === "found") setFood(r.food);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("unavailable");
      return;
    }
    setCamState("starting");
    handled.current = false;
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      controls.current = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, videoRef.current!, (result) => {
        if (result && !handled.current) {
          handled.current = true;
          controls.current?.stop();
          setCamState("idle");
          navigator.vibrate?.(60);
          check(result.getText());
        }
      });
      setCamState("on");
    } catch (e) {
      const name = (e as DOMException)?.name;
      setCamState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
    }
  }
  function stopCamera() {
    controls.current?.stop();
    setCamState("idle");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Scan food" subtitle="Product barcodes (EAN/UPC) and GS1 QR codes" back="/nutrition" />

      <Card className="space-y-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="size-full object-cover" muted playsInline aria-label="Camera preview" />
          {camState !== "on" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
              {camState === "starting" ? (
                <Spinner label="Starting camera…" />
              ) : camState === "denied" ? (
                <>
                  <CameraOff className="size-8" aria-hidden />
                  <p className="text-sm">Camera access was blocked. You can allow it in your browser&apos;s site settings, or type the barcode below.</p>
                </>
              ) : camState === "unavailable" ? (
                <>
                  <CameraOff className="size-8" aria-hidden />
                  <p className="text-sm">No camera is available here. Type the numbers under the barcode instead.</p>
                </>
              ) : (
                <>
                  <Camera className="size-8" aria-hidden />
                  <p className="text-sm">We&apos;ll ask for camera permission. The video stays on your device — only the scanned code is sent.</p>
                  <Button onClick={startCamera}>Start camera</Button>
                </>
              )}
            </div>
          )}
          {camState === "on" && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80" aria-hidden />}
        </div>
        {camState === "on" && (
          <Button variant="secondary" className="w-full" onClick={stopCamera}>
            Stop camera
          </Button>
        )}
      </Card>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) check(manual.trim());
          }}
          className="flex items-end gap-2"
        >
          <div className="flex-1">
            <Field label="Or enter the barcode number" htmlFor="code">
              <Input id="code" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 3017624010701" />
            </Field>
          </div>
          <Button type="submit" variant="secondary" loading={loading} icon={<Keyboard className="size-4" />}>
            Look up
          </Button>
        </form>
      </Card>

      {loading && <Spinner label="Looking up product…" />}
      {error && <Alert tone="danger">{error}</Alert>}
      {lookup?.status === "found" && (
        <Alert tone="success" title={`Found: ${lookup.food.name}`} action={<Button size="sm" onClick={() => setFood(lookup.food)}>Choose serving & add</Button>}>
          Source: {lookup.attribution}. Check the values against the package if they look off.
        </Alert>
      )}
      {lookup?.status === "not_found" && (
        <Alert tone="warning" title="Product not found" action={<LinkButton href={`/nutrition/foods/new?barcode=${lookup.gtin}`} size="sm" variant="primary">Add it from the label</LinkButton>}>
          {lookup.message} Barcode: {lookup.gtin}
        </Alert>
      )}
      {lookup?.status === "invalid" && <Alert tone="warning" title="That code doesn't look right">{lookup.message} Try scanning again or type it in.</Alert>}
      {lookup?.status === "not_food_code" && (
        <Alert tone="info" title="Not a food product code">
          {lookup.message}
          <span className="mt-1 block break-all font-mono text-xs">{lookup.content}</span>
        </Alert>
      )}

      <FoodLogSheet food={food} open={!!food} onClose={() => setFood(null)} date={date} source="barcode" />
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense>
      <Scanner />
    </Suspense>
  );
}

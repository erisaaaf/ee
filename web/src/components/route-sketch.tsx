/** Simple SVG outline of a recorded route (no third-party map tiles, so no location data leaves the app). */
export function RouteSketch({ points, label = "Recorded route" }: { points: [number, number, ...unknown[]][]; label?: string }) {
  if (points.length < 2) return null;
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const w = (maxLon - minLon) * Math.cos(midLat) || 1e-6;
  const h = maxLat - minLat || 1e-6;
  const scale = 280 / Math.max(w, h);
  const xy = points.map(([lat, lon]) => [10 + (lon - minLon) * Math.cos(midLat) * scale, 10 + (maxLat - lat) * scale]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [sx, sy] = xy[0];
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${20 + w * scale} ${20 + h * scale}`} className="mx-auto max-h-72 w-full" role="img" aria-label={`${label}. Shape only — no map background.`}>
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={sx} cy={sy} r={6} fill="var(--success)" stroke="var(--surface)" strokeWidth={2} />
      <circle cx={ex} cy={ey} r={6} fill="var(--danger)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

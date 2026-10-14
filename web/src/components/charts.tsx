"use client";

import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3 } from "lucide-react";
import { cx } from "./ui";

// Chart conventions (dataviz method): one series per chart unless stated, one axis, thin marks with
// rounded data-ends, recessive grid, target as a dashed reference line, tooltips on hover/tap,
// missing days are gaps (never drawn as zero), and every chart has a table view.

export type Point = { date: string; value: number | null };

const fmtDay = (d: string, long = false) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, long ? { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-text">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted">
          {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} aria-hidden />}
          <span>{r.label}</span>
          <span className="tabular ml-auto font-medium text-text">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function ChartFrame({ title, subtitle, children, table, summary }: { title: string; subtitle?: ReactNode; children: ReactNode; table: ReactNode; summary?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="rounded-2xl border border-border bg-surface p-4">
      <figcaption className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{title}</p>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <button onClick={() => setAsTable((v) => !v)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-surface-2" aria-pressed={asTable}>
          {asTable ? <BarChart3 className="size-4" aria-hidden /> : <Table2 className="size-4" aria-hidden />}
          {asTable ? "Chart" : "Table"}
        </button>
      </figcaption>
      {summary}
      {asTable ? <div className="max-h-72 overflow-auto">{table}</div> : children}
    </figure>
  );
}

function DataTable({ rows, unit, format }: { rows: Point[]; unit: string; format: (v: number) => string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted">
          <th className="py-1 font-medium">Day</th>
          <th className="py-1 text-right font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {[...rows].reverse().map((r) => (
          <tr key={r.date} className="border-t border-border">
            <td className="py-1.5">{fmtDay(r.date, true)}</td>
            <td className="tabular py-1.5 text-right">{r.value == null ? <span className="text-muted">not logged</span> : `${format(r.value)} ${unit}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Daily values as bars, with an optional target line. Tap a bar to inspect that day. */
export function DailyBarChart({
  title,
  data,
  unit,
  color,
  target,
  format = (v) => Math.round(v).toLocaleString(),
  subtitle,
  onSelect,
  height = 200,
}: {
  title: string;
  data: Point[];
  unit: string;
  color: string;
  target?: number | null;
  format?: (v: number) => string;
  subtitle?: ReactNode;
  onSelect?: (date: string) => void;
  height?: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const logged = data.filter((d) => d.value != null);
  const avg = logged.length ? logged.reduce((s, d) => s + d.value!, 0) / logged.length : null;
  const sel = data.find((d) => d.date === selected);
  const dense = data.length > 45;
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      table={<DataTable rows={data} unit={unit} format={format} />}
      summary={
        <p className="mb-2 text-xs text-muted">
          {logged.length ? (
            <>
              Average <span className="tabular font-medium text-text">{format(avg!)} {unit}</span> on {logged.length} logged day{logged.length === 1 ? "" : "s"}
              {logged.length < data.length && ` · ${data.length - logged.length} not logged`}
            </>
          ) : (
            "No data in this period yet."
          )}
        </p>
      }
    >
      <div style={{ height }} role="img" aria-label={`${title}: ${logged.length} days logged${avg != null ? `, average ${format(avg)} ${unit}` : ""}. Use the Table button for exact values.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap={dense ? 1 : 2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={(d) => fmtDay(d)} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={16} />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={false}
              width={44}
              // Always include the target so its reference line is visible even when values are far below it.
              domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax || 0, target ?? 0) * 1.08) || 1]}
              tickFormatter={(v) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
            />
            {target ? <ReferenceLine y={target} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value: "Target", position: "insideTopRight", fontSize: 10, fill: "var(--text-muted)" }} /> : null}
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={fmtDay(String(payload[0].payload.date), true)} rows={[{ label: title, value: payload[0].payload.value == null ? "not logged" : `${format(Number(payload[0].payload.value))} ${unit}`, color }]} />
                ) : null
              }
            />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              onClick={(d: { payload?: Point }) => {
                const date = d.payload?.date;
                if (!date) return;
                setSelected(date);
                onSelect?.(date);
              }}
              className="cursor-pointer"
            >
              {data.map((d) => (
                <Cell key={d.date} fill={color} fillOpacity={selected && selected !== d.date ? 0.45 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {sel && (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm" role="status">
          <span className="font-medium">{fmtDay(sel.date, true)}:</span> {sel.value == null ? "not logged" : `${format(sel.value)} ${unit}`}
          {target && sel.value != null ? ` (${Math.round((sel.value / target) * 100)}% of target)` : ""}
        </p>
      )}
    </ChartFrame>
  );
}

/** A single-series line over time (e.g. strength progression). Gaps are not connected across missing data. */
export function TrendLine({ title, data, unit, color = "var(--primary)", subtitle, format = (v) => String(Math.round(v * 10) / 10) }: { title: string; data: Point[]; unit: string; color?: string; subtitle?: ReactNode; format?: (v: number) => string }) {
  const logged = data.filter((d) => d.value != null);
  const first = logged[0]?.value;
  const last = logged[logged.length - 1]?.value;
  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      table={<DataTable rows={data} unit={unit} format={format} />}
      summary={
        logged.length >= 2 && first != null && last != null ? (
          <p className="mb-2 text-xs text-muted">
            From <span className="tabular font-medium text-text">{format(first)}</span> to <span className="tabular font-medium text-text">{format(last)} {unit}</span> over {logged.length} sessions
          </p>
        ) : (
          <p className="mb-2 text-xs text-muted">{logged.length ? "Log a few more sessions to see a trend." : "No data yet."}</p>
        )
      }
    >
      <div style={{ height: 200 }} role="img" aria-label={`${title}. Use the Table button for exact values.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={(d) => fmtDay(d)} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={16} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
              content={({ active, payload }) =>
                active && payload?.length && payload[0].payload.value != null ? <TooltipBox title={fmtDay(String(payload[0].payload.date), true)} rows={[{ label: title, value: `${format(Number(payload[0].payload.value))} ${unit}`, color }]} /> : null
              }
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Protein / carbs / fat per day as stacked bars (3 series: legend + tooltip + table). */
export function MacroChart({ data }: { data: { date: string; proteinG: number | null; carbsG: number | null; fatG: number | null }[] }) {
  const series = [
    { key: "proteinG", label: "Protein", color: "var(--protein)" },
    { key: "carbsG", label: "Carbs", color: "var(--carbs)" },
    { key: "fatG", label: "Fat", color: "var(--fat)" },
  ] as const;
  return (
    <ChartFrame
      title="Macros per day"
      subtitle="Grams of protein, carbohydrates and fat"
      table={
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 font-medium">Day</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.date} className="border-t border-border">
                <td className="py-1.5">{fmtDay(d.date, true)}</td>
                {series.map((s) => (
                  <td key={s.key} className="tabular py-1.5 text-right">
                    {d[s.key] == null ? <span className="text-muted">—</span> : `${Math.round(d[s.key]!)} g`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
      summary={
        <ul className="mb-2 flex flex-wrap gap-3 text-xs text-muted" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      }
    >
      <div style={{ height: 200 }} role="img" aria-label="Macros per day as stacked bars. Use the Table button for exact values.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
            <XAxis dataKey="date" tickFormatter={(d) => fmtDay(d)} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={16} />
            <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={fmtDay(String(payload[0].payload.date), true)}
                    rows={series.map((s) => ({ label: s.label, value: payload[0].payload[s.key] == null ? "—" : `${Math.round(payload[0].payload[s.key])} g`, color: s.color }))}
                  />
                ) : null
              }
            />
            {series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="m" fill={s.color} stroke="var(--surface)" strokeWidth={1} maxBarSize={28} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

export function RangePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    ["week", "Week"],
    ["month", "Month"],
    ["year", "Year"],
    ["custom", "Custom"],
  ];
  return (
    <div role="tablist" aria-label="Date range" className="inline-flex rounded-xl bg-surface-2 p-1">
      {opts.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)} className={cx("min-h-9 rounded-lg px-3 text-sm font-medium", value === v ? "bg-surface shadow-sm" : "text-muted hover:text-text")}>
          {l}
        </button>
      ))}
    </div>
  );
}

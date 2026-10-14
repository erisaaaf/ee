"use client";

import Link from "next/link";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, Check, ChevronLeft, CircleHelp, Info, Loader2, X } from "lucide-react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ── Buttons ──
type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
  soft: "bg-primary-soft text-primary hover:brightness-95",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "sm" | "md" | "lg"; icon?: ReactNode }>(
  function Button({ variant = "primary", loading, size = "md", icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none",
          size === "sm" ? "min-h-9 px-3 text-sm" : size === "lg" ? "min-h-12 px-5 text-base" : "min-h-11 px-4 text-sm",
          variants[variant],
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  },
);

export function LinkButton({ href, variant = "secondary", size = "md", className, children, icon }: { href: string; variant?: Variant; size?: "sm" | "md" | "lg"; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors",
        size === "sm" ? "min-h-9 px-3 text-sm" : size === "lg" ? "min-h-12 px-5 text-base" : "min-h-11 px-4 text-sm",
        variants[variant],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx("inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text", className)} {...rest}>
      {children}
    </button>
  );
}

// ── Layout ──
export function Card({ className, children, as: As = "section", ...rest }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" | "li" } & Record<string, unknown>) {
  return (
    <As className={cx("rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow)]", className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 id={id} className="text-base font-semibold">
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: ReactNode; back?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-1">
        {back && (
          <Link href={back} aria-label="Back" className="-ml-2 inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
            <ChevronLeft className="size-5" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>}
    </header>
  );
}

// ── Form fields ──
export function Field({ label, hint, error, children, htmlFor, optional }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = "w-full min-h-11 rounded-xl border border-border bg-surface px-3 text-base text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputCls, "py-2", className)} {...rest} />;
});
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-border")}
      >
        <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}

/** Multi- or single-select chip group (accessible as toggle buttons). */
export function Chips<T extends string>({ options, value, onChange, multiple = true, label }: { options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; multiple?: boolean; label?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            aria-pressed={on}
            onClick={() => onChange(multiple ? (on ? value.filter((v) => v !== o.value) : [...value, o.value]) : [o.value])}
            className={cx(
              "inline-flex min-h-10 items-center gap-1 rounded-full border px-3.5 text-sm transition-colors",
              on ? "border-primary bg-primary-soft text-primary font-medium" : "border-border bg-surface text-text hover:bg-surface-2",
            )}
          >
            {on && <Check className="size-3.5" aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("min-h-9 rounded-lg px-3 text-sm font-medium transition-colors", value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Free-text list input (e.g. allergies, ingredients). */
export function TagInput({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...value, t.slice(0, 40)]);
    setText("");
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          aria-label={label}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="inline-flex size-7 items-center justify-center rounded-full hover:bg-border">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Feedback ──
export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "primary" | "warning" | "danger" | "success" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    primary: "bg-primary-soft text-primary",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-text",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

/** Marks a value as estimated (photo, typical recipe, calculation). */
export function EstimateBadge({ label = "Estimate", title }: { label?: string; title?: string }) {
  return (
    <Badge tone="warning" className="whitespace-nowrap">
      <span aria-hidden>≈</span>
      <span title={title ?? "Estimated — not an exact measurement"}>{label}</span>
    </Badge>
  );
}

export function DataQualityBadge({ quality }: { quality: string }) {
  if (quality === "estimate") return <EstimateBadge title="Typical recipe — real dishes vary" />;
  if (quality === "label") return <Badge tone="info">From product data</Badge>;
  if (quality === "user") return <Badge>Your food</Badge>;
  return <Badge tone="neutral">Typical values</Badge>;
}

export function Alert({ tone = "info", title, children, action }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children?: ReactNode; action?: ReactNode }) {
  const map = { info: "bg-info-soft", warning: "bg-warning-soft", danger: "bg-danger-soft", success: "bg-success-soft" };
  const Icon = tone === "info" ? Info : tone === "success" ? Check : AlertTriangle;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl p-3 text-sm", map[tone])}>
      <Icon className={cx("mt-0.5 size-4 shrink-0", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-primary")} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted [&_a]:underline">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong while loading your data.";
  return (
    <Alert tone="danger" title="Couldn't load this" action={onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}>
      {msg}
    </Alert>
  );
}

// ── Progress visuals ──
export function ProgressBar({ value, max, color = "var(--primary)", label, className }: { value: number; max: number | null | undefined; color?: string; label: string; className?: string }) {
  const pct = max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max ?? undefined}
      aria-valuetext={max ? `${Math.round(value)} of ${max}` : `${Math.round(value)}, no target set`}
      className={cx("h-2 w-full overflow-hidden rounded-full bg-[var(--ring-track)]", className)}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Ring({ value, max, size = 92, stroke = 9, color = "var(--primary)", children, label }: { value: number; max: number | null | undefined; size?: number; stroke?: number; color?: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={max ? `${label}: ${Math.round(value)} of ${max}` : `${label}: ${Math.round(value)}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ring-track)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

// ── Glossary explanation ──
export function InfoTip({ term }: { term: GlossaryKey }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[term];
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`What is ${g.title}?`} className="inline-flex size-7 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text">
        <CircleHelp className="size-4" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={g.title}>
        <p className="text-sm leading-relaxed">{g.text}</p>
      </Sheet>
    </>
  );
}

// ── Sheet / dialog ──
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cx(
        "m-0 mt-auto w-full max-w-none rounded-t-3xl bg-surface p-0 text-text backdrop:bg-black/40 sm:m-auto sm:rounded-3xl",
        wide ? "sm:max-w-2xl" : "sm:max-w-lg",
        "max-h-[92dvh]",
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 pb-safe">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

// ── Toasts & confirm ──
type Toast = { id: number; tone: "success" | "error" | "info"; text: string; action?: { label: string; onClick: () => void } };
type ConfirmOpts = { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean };
const FeedbackCtx = createContext<{ toast: (t: Omit<Toast, "id">) => void; confirm: (o: ConfirmOpts) => Promise<boolean> } | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirm] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.action ? 6000 : 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ ...o, resolve })), []);
  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirm(null);
  };
  return (
    <FeedbackCtx.Provider value={{ toast, confirm }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "animate-fade-up pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg",
              t.tone === "error" ? "bg-danger text-white" : "bg-text text-bg",
            )}
            role={t.tone === "error" ? "alert" : "status"}
          >
            <span>{t.text}</span>
            {t.action && (
              <button className="font-semibold underline" onClick={() => { t.action!.onClick(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
      <Sheet
        open={!!confirmState}
        onClose={() => close(false)}
        title={confirmState?.title ?? ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button variant={confirmState?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {confirmState?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{confirmState?.body}</div>
      </Sheet>
    </FeedbackCtx.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackCtx);
  if (!ctx) throw new Error("useFeedback must be used inside FeedbackProvider");
  return ctx;
}

export function Stat({ label, value, sub, color }: { label: string; value: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular truncate text-lg font-semibold" style={color ? { color } : undefined}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

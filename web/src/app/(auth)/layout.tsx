import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/login" className="mb-6 flex items-center gap-2 text-xl font-semibold">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-on-primary" aria-hidden>
          V
        </span>
        Vitality
      </Link>
      <main className="w-full max-w-sm">{children}</main>
      <p className="mt-8 max-w-sm text-center text-xs text-muted">
        Vitality offers general wellness information, not medical advice. <Link className="underline" href="/privacy-policy">Privacy</Link>
      </p>
    </div>
  );
}

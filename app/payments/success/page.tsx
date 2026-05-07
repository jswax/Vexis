import Link from "next/link";
import { Container } from "@/components/Container";

export default function PaymentSuccessPage() {
  return (
    <Container>
      <div className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 grid h-16 w-16 place-items-center rounded-full bg-foreground">
          <svg
            className="h-7 w-7 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-foreground">
          You&apos;re in.
        </h1>
        <p className="mt-4 max-w-sm text-base text-muted-foreground">
          Your subscription is active. Head to your dashboard to grab your
          TradingView indicator access key.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-white px-6 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            View Plans
          </Link>
        </div>
      </div>
    </Container>
  );
}

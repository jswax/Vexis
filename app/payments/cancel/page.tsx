import Link from "next/link";
import { Container } from "@/components/Container";

export default function PaymentCancelPage() {
  return (
    <Container>
      <div className="flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <h1 className="font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-foreground">
          Payment cancelled.
        </h1>
        <p className="mt-4 max-w-sm text-base text-muted-foreground">
          No charge was made. You can subscribe whenever you&apos;re ready.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02]"
          >
            Back to Pricing
          </Link>
          <Link
            href="/contact"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-white px-6 text-sm font-semibold text-foreground transition hover:bg-surface"
          >
            Contact Support
          </Link>
        </div>
      </div>
    </Container>
  );
}

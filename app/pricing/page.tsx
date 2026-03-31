"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { PricingCards } from "@/components/PricingCards";

function PricingBanner() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  if (!message) return null;
  return (
    <div className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-foreground">
      {message}
    </div>
  );
}

export default function PricingPage() {
  return (
    <div>
      <PageHeader
        eyebrow="PRICING"
        title="Choose your tier."
        description="Choose Free or Pro. Payments are not connected yet."
      />
      <Container>
        <div className="py-12">
          <Suspense fallback={null}>
            <PricingBanner />
          </Suspense>
          <PricingCards />
        </div>
      </Container>
    </div>
  );
}

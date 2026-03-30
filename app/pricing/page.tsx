import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";
import { PricingCards } from "@/components/PricingCards";

export default function PricingPage() {
  return (
    <div>
      <PageHeader
        eyebrow="PRICING"
        title="Choose your tier."
        description="Placeholder copy. No Stripe, no payments—UI only."
      />
      <Container>
        <div className="py-12">
          <PricingCards />
        </div>
      </Container>
    </div>
  );
}


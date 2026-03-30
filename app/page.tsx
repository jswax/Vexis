import { Hero } from "@/components/home/Hero";
import { LogoMarquee } from "@/components/home/LogoMarquee";
import { Features } from "@/components/home/Features";
import { HowItWorks } from "@/components/home/HowItWorks";
import { PricingCards } from "@/components/PricingCards";
import { Testimonials } from "@/components/home/Testimonials";
import { Container } from "@/components/Container";
import { FadeIn } from "@/components/motion/Motion";

export default function Home() {
  return (
    <div>
      <Hero />
      <LogoMarquee />
      <Features />
      <HowItWorks />

      <section className="bg-surface">
        <Container>
          <FadeIn className="py-16 md:py-24">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
                PRICING
              </div>
              <h2 className="mt-4 font-[var(--font-display)] text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-4xl">
                Pricing that scales with conviction.
              </h2>
              <p className="mt-4 text-base text-muted-foreground sm:text-lg">
                Placeholder copy. Free and Pro. No payments wired up.
              </p>
            </div>

            <div className="mt-12">
              <PricingCards />
            </div>
          </FadeIn>
        </Container>
      </section>

      <Testimonials />
    </div>
  );
}

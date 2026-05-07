"use client";

import { Container } from "@/components/Container";
import { FadeIn, Stagger } from "@/components/motion/Motion";
import { motion } from "framer-motion";

const items = [
  {
    name: "James R.",
    role: "Futures Trader",
    initials: "JR",
    quote: "I've tried dozens of indicators. This is the first one where the signals actually match what price does. The regime detection alone changed how I trade.",
  },
  {
    name: "Sara M.",
    role: "Swing Trader",
    initials: "SM",
    quote: "Setup took five minutes and the first signal hit within an hour. Clean entries, no repainting. This is what I've been looking for.",
  },
  {
    name: "Derek T.",
    role: "Options Trader",
    initials: "DT",
    quote: "The multi-timeframe confluence is what sold me. I stopped getting chopped out of trades I should have held.",
  },
];

export function Testimonials() {
  return (
    <section className="bg-surface">
      <Container>
        <FadeIn className="py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
              TESTIMONIALS
            </div>
            <h2 className="mt-4 font-[var(--font-display)] text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-4xl">
              Traders want clarity. Not clutter.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Hear from traders who use Vexis to bring discipline to every session.
            </p>
          </div>

          <Stagger className="mt-12 grid gap-10 md:grid-cols-3">
            {items.map((t, i) => (
              <motion.div
                key={i}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  show: {
                    opacity: 1,
                    y: 0,
                    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                  },
                }}
                className="relative pl-6"
              >
                <div className="absolute left-0 top-1 h-10 w-[2px] bg-accent" />
                <div className="text-2xl font-semibold italic text-foreground">
                  &ldquo;{t.quote}&rdquo;
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-white text-sm font-semibold text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {t.name}
                    </div>
                    <div className="text-sm text-muted-foreground">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </Stagger>
        </FadeIn>
      </Container>
    </section>
  );
}

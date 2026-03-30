"use client";

import { Container } from "@/components/Container";
import { FadeIn, Stagger } from "@/components/motion/Motion";
import { motion } from "framer-motion";

const steps = [
  {
    n: "01",
    t: "Install",
    d: "Placeholder copy describing how a trader gets started quickly.",
  },
  {
    n: "02",
    t: "Configure",
    d: "Placeholder copy describing calibration for a specific market.",
  },
  {
    n: "03",
    t: "Execute",
    d: "Placeholder copy describing disciplined, signal-driven execution.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-white">
      <Container>
        <FadeIn className="py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
              HOW IT WORKS
            </div>
            <h2 className="mt-4 font-[var(--font-display)] text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-4xl">
              A timeline built for momentum.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Placeholder copy. Horizontal on desktop, vertical on mobile. The
              connecting line draws in on scroll.
            </p>
          </div>

          <div className="relative mt-12">
            {/* Desktop line */}
            <div className="pointer-events-none absolute left-0 top-6 hidden h-[1px] w-full bg-border md:block" />
            <motion.div
              className="pointer-events-none absolute left-0 top-6 hidden h-[1px] w-full origin-left bg-accent md:block"
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />

            <Stagger className="grid gap-10 md:grid-cols-3 md:gap-8">
              {steps.map((s) => (
                <motion.div
                  key={s.n}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    show: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                    },
                  }}
                  className="relative"
                >
                  <div className="flex items-start gap-4 md:flex-col md:gap-5">
                    <div className="relative z-10 grid h-12 w-12 place-items-center rounded-full border border-accent bg-white text-sm font-semibold text-accent">
                      {s.n}
                    </div>

                    <div>
                      <div className="text-base font-semibold tracking-[-0.01em] text-foreground">
                        {s.t}
                      </div>
                      <div className="mt-2 text-sm leading-7 text-muted-foreground">
                        {s.d}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </Stagger>
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}


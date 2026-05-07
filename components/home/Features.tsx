"use client";

import { Container } from "@/components/Container";
import { FadeIn, Stagger } from "@/components/motion/Motion";
import { BarChart3, CandlestickChart, Radar } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    n: "01",
    title: "Multi-Timeframe Confluence",
    desc: "Signals are validated across multiple timeframes before triggering — filtering out noise and surfacing only the highest-probability setups.",
    Icon: BarChart3,
  },
  {
    n: "02",
    title: "Smart Regime Detection",
    desc: "The indicator reads market structure in real time — trending, ranging, or volatile — and adapts signal sensitivity to match current conditions.",
    Icon: Radar,
  },
  {
    n: "03",
    title: "Instant Alerts",
    desc: "Get notified on TradingView, email, or webhook the moment a signal fires. Never miss an entry waiting on a chart.",
    Icon: CandlestickChart,
  },
];

export function Features() {
  return (
    <section className="bg-surface">
      <Container>
        <FadeIn className="py-16 md:py-24">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
              FEATURES
            </div>
            <h2 className="mt-4 font-[var(--font-display)] text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-4xl">
              Built for signal clarity.
              <span className="text-muted-foreground">
                {" "}
                Designed for fast decisions.
              </span>
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Everything you need to trade with confidence. Nothing you don&apos;t.
            </p>
          </div>

          <Stagger className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <motion.div
                key={f.n}
                className="group relative bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                style={{ borderLeft: "2px solid transparent" }}
                whileHover={{ y: -4 }}
              >
                <div className="pointer-events-none absolute right-6 top-6 select-none font-[var(--font-display)] text-6xl font-semibold tracking-[-0.06em] text-border">
                  {f.n}
                </div>

                <div className="flex items-center gap-4">
                  <div className="grid h-10 w-10 place-items-center bg-[#F4F4F5]">
                    <f.Icon className="h-5 w-5 text-accent" />
                  </div>
                  <div className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                    {f.title}
                  </div>
                </div>

                <p className="mt-5 text-sm leading-7 text-muted-foreground">
                  {f.desc}
                </p>

                <div className="mt-6 h-[2px] w-10 bg-border transition-colors duration-200 group-hover:bg-accent" />

                <div className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-accent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              </motion.div>
            ))}
          </Stagger>
        </FadeIn>
      </Container>
    </section>
  );
}


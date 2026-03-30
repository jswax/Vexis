"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Container } from "@/components/Container";
import { DashboardCard } from "./DashboardCard";

const headline = ["The", "indicator", "that", "trades", "with", "you."];
const accentWords = new Set(["trades"]);

export function Hero() {
  return (
    <section className="min-h-[calc(100vh-64px)] bg-white">
      <Container>
        <div className="grid min-h-[calc(100vh-64px)] items-center gap-12 py-16 md:grid-cols-12 md:gap-10">
          <motion.div
            className="md:col-span-6"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08 } },
            }}
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.15em] text-muted-foreground"
            >
              <span className="h-1.5 w-6 bg-border" />
              PRODUCT
            </motion.div>

            <motion.h1
              className="mt-6 font-[var(--font-display)] text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-foreground sm:text-6xl lg:text-[78px]"
              variants={{ hidden: {}, show: {} }}
            >
              <motion.span
                className="inline-block"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } },
                }}
              >
                {headline.map((w, i) => (
                  <motion.span
                    key={`${w}-${i}`}
                    className={[
                      "inline-block",
                      accentWords.has(w) ? "text-accent" : "text-foreground",
                    ].join(" ")}
                    variants={{
                      hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
                      show: {
                        opacity: 1,
                        y: 0,
                        filter: "blur(0px)",
                        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                      },
                    }}
                  >
                    {w}
                    {i < headline.length - 1 ? "\u00A0" : ""}
                  </motion.span>
                ))}
              </motion.span>
            </motion.h1>

            <motion.p
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg"
            >
              Placeholder subtext. Ultra clean, data-driven, premium. Frontend
              only—no auth, no backend, no payments.
            </motion.p>

            <motion.div
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
              }}
              className="mt-10 flex flex-col gap-3 sm:flex-row"
            >
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                Get Started
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-white px-6 text-sm font-semibold text-foreground transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                View Pricing
              </Link>
            </motion.div>
          </motion.div>

          <motion.div
            className="md:col-span-6 md:justify-self-end"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
          >
            <DashboardCard />
          </motion.div>
        </div>
      </Container>
    </section>
  );
}


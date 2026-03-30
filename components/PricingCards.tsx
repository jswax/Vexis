"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

const tiers = [
  {
    name: "Free",
    price: "$0",
    note: "Placeholder note",
    features: [
      "Placeholder feature",
      "Placeholder feature",
      "Placeholder feature",
    ],
    cta: "Start Free",
    href: "/login",
    featured: false,
  },
  {
    name: "Pro",
    price: "$99",
    note: "Placeholder note",
    features: [
      "Placeholder feature",
      "Placeholder feature",
      "Placeholder feature",
    ],
    cta: "Go Pro",
    href: "/login",
    featured: true,
  },
];

export function PricingCards() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {tiers.map((t) => (
        <motion.div
          key={t.name}
          className={[
            "relative overflow-hidden",
            t.featured
              ? "rounded-2xl bg-foreground p-7 text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
              : "rounded-2xl border border-border bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
          ].join(" ")}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          {t.featured ? (
            <div className="absolute right-5 top-5 rounded-full bg-accent px-3 py-1 text-xs font-semibold tracking-wide text-white">
              Most Popular
            </div>
          ) : null}

          <div className="flex items-baseline justify-between gap-6">
            <h3
              className={[
                "font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em]",
                t.featured ? "text-white" : "text-foreground",
              ].join(" ")}
            >
              {t.name}
            </h3>
            <div className="text-right">
              <div
                className={[
                  "text-3xl font-semibold tracking-[-0.03em]",
                  t.featured ? "text-white" : "text-foreground",
                ].join(" ")}
              >
                {t.price}
              </div>
              <div className={t.featured ? "text-xs text-white/70" : "text-xs text-muted-foreground"}>
                {t.note}
              </div>
            </div>
          </div>

          <motion.ul
            className={["mt-7 space-y-3 text-sm", t.featured ? "text-white/80" : "text-muted-foreground"].join(" ")}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.35 }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08 } },
            }}
          >
            {t.features.map((f, i) => (
              <motion.li
                key={`${t.name}-${i}`}
                className="flex items-start gap-3"
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
                }}
              >
                <span
                  className={[
                    "mt-[0.18rem] grid h-5 w-5 shrink-0 place-items-center rounded-full",
                    t.featured ? "bg-white/10" : "bg-foreground/5",
                  ].join(" ")}
                >
                  <Check className={t.featured ? "h-3.5 w-3.5 text-accent" : "h-3.5 w-3.5 text-foreground"} />
                </span>
                <span className="leading-6">{f}</span>
              </motion.li>
            ))}
          </motion.ul>

          <div className="mt-8">
            <Link
              href={t.href}
              className={[
                "inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-sm font-semibold transition shadow-sm",
                t.featured
                  ? "bg-accent text-white hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                  : "border border-foreground bg-white text-foreground hover:bg-surface",
              ].join(" ")}
            >
              {t.cta}
            </Link>
          </div>
        </motion.div>
      ))}
    </div>
  );
}


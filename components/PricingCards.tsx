"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

const primaryBtnCls =
  "inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] disabled:opacity-60";

const secondaryBtnCls =
  "inline-flex h-11 w-full items-center justify-center rounded-full border border-foreground bg-white px-5 text-sm font-semibold text-foreground transition shadow-sm hover:bg-surface disabled:opacity-60";

const currentPlanDarkCls =
  "inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 text-sm font-semibold text-white/70 opacity-95 select-none";

const currentPlanLightCls =
  "inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-border bg-surface px-5 text-sm font-semibold text-muted-foreground opacity-80 select-none";

type Session =
  | { kind: "loading" }
  | { kind: "out" }
  | { kind: "in"; plan: "free" | "pro" };

const standardTier = {
  name: "Standard",
  price: "$50",
  note: "per month",
  features: [
    "Full TradingView indicator access",
    "Multi-timeframe signals",
    "Email & TradingView alerts",
  ],
  cta: "Get Standard",
  href: "/register" as const,
  featured: false,
  plan: "standard" as const,
};

const premiumTier = {
  name: "Premium",
  price: "$200",
  note: "per month",
  features: [
    "Everything in Standard",
    "Priority signal updates",
    "Private Discord community",
  ],
  cta: "Get Premium",
  featured: true,
  plan: "premium" as const,
};

const tiers = [standardTier, premiumTier];

export function PricingCards() {
  const pathname = usePathname() ?? "/";
  const [session, setSession] = useState<Session>({ kind: "loading" });
  const [checkoutLoading, setCheckoutLoading] = useState<"standard" | "premium" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const loginHref = `/login?next=${encodeURIComponent(pathname === "/" ? "/pricing" : pathname)}`;

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<{ plan: string }>("/auth/me");
        setSession({ kind: "in", plan: me.plan === "pro" ? "pro" : "free" });
      } catch {
        setSession({ kind: "out" });
      }
    };
    void load();
    const onAuth = () => void load();
    window.addEventListener("vexis-auth-changed", onAuth);
    return () => window.removeEventListener("vexis-auth-changed", onAuth);
  }, []);

  const handleCheckout = useCallback(
    async (plan: "standard" | "premium") => {
      setCheckoutLoading(plan);
      setCheckoutError(null);
      try {
        const { url } = await apiFetch<{ url: string }>(
          "/payments/create-checkout-session",
          { method: "POST", body: JSON.stringify({ plan }) },
        );
        window.location.href = url;
      } catch (err) {
        const e = err as { status?: number };
        if (e.status === 503) {
          setCheckoutError(
            "Payments are coming soon. Email support@vexis.com to subscribe early.",
          );
        } else {
          setCheckoutError(
            err instanceof Error ? err.message : "Something went wrong. Please try again.",
          );
        }
        setCheckoutLoading(null);
      }
    },
    [],
  );

  return (
    <>
      <div className="grid items-stretch gap-6 md:grid-cols-2">
        {tiers.map((t) => (
          <motion.div
            key={t.name}
            className={[
              "relative flex h-full min-h-0 flex-col overflow-hidden",
              t.featured
                ? "rounded-2xl bg-foreground p-7 text-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                : "rounded-2xl border border-border bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
            ].join(" ")}
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <div className="flex shrink-0 items-start justify-between gap-4">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                <h3
                  className={[
                    "font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em]",
                    t.featured ? "text-white" : "text-foreground",
                  ].join(" ")}
                >
                  {t.name}
                </h3>
                {t.featured ? (
                  <span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white sm:text-xs">
                    Most Popular
                  </span>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={[
                    "text-3xl font-semibold leading-none tracking-[-0.03em]",
                    t.featured ? "text-white" : "text-foreground",
                  ].join(" ")}
                >
                  {t.price}
                </div>
                <div
                  className={[
                    "mt-1.5 text-right text-xs leading-snug",
                    t.featured ? "text-white/70" : "text-muted-foreground",
                  ].join(" ")}
                >
                  {t.note}
                </div>
              </div>
            </div>

            <motion.ul
              className={[
                "mt-7 shrink-0 space-y-3 text-sm",
                t.featured ? "text-white/80" : "text-muted-foreground",
              ].join(" ")}
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
                    <Check
                      className={
                        t.featured
                          ? "h-3.5 w-3.5 text-accent"
                          : "h-3.5 w-3.5 text-foreground"
                      }
                    />
                  </span>
                  <span className="leading-6">{f}</span>
                </motion.li>
              ))}
            </motion.ul>

            <div className="mt-auto pt-8">
              {session.kind === "loading" ? (
                <div
                  className={`h-11 w-full animate-pulse rounded-full ${t.featured ? "bg-white/25" : "bg-foreground/10"}`}
                  aria-hidden
                />
              ) : session.kind === "out" ? (
                <Link
                  href={t.featured ? loginHref : standardTier.href}
                  className={t.featured ? primaryBtnCls : secondaryBtnCls}
                >
                  {t.cta}
                </Link>
              ) : session.plan === "pro" && t.featured ? (
                <span className={currentPlanDarkCls} aria-current="true">
                  Current plan
                </span>
              ) : session.plan === "pro" && !t.featured ? (
                <span className={currentPlanLightCls}>On Premium</span>
              ) : (
                <button
                  type="button"
                  disabled={checkoutLoading === t.plan}
                  onClick={() => void handleCheckout(t.plan)}
                  className={t.featured ? primaryBtnCls : secondaryBtnCls}
                >
                  {checkoutLoading === t.plan ? "Redirecting…" : t.cta}
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {checkoutError ? (
        <div className="mt-6 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
          {checkoutError}
        </div>
      ) : null}
    </>
  );
}

"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";

const proCtaClassName =
  "inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]";

type Session =
  | { kind: "loading" }
  | { kind: "out" }
  | { kind: "in"; plan: "free" | "pro" };

const freeTier = {
  name: "Free",
  price: "$0",
  note: "Full product access while we are in beta.",
  features: [
    "Placeholder feature",
    "Placeholder feature",
    "Placeholder feature",
  ],
  cta: "Start Free",
  href: "/register" as const,
  featured: false,
};

const proTier = {
  name: "Pro",
  price: "$0",
  note: "Enable the Pro label on your account (no payment yet).",
  features: [
    "Placeholder feature",
    "Placeholder feature",
    "Placeholder feature",
  ],
  cta: "Go Pro",
  featured: true,
};

const tiers = [freeTier, proTier];

export function PricingCards() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [session, setSession] = useState<Session>({ kind: "loading" });
  const [proModalOpen, setProModalOpen] = useState(false);
  const [proSubmitting, setProSubmitting] = useState(false);
  const [proError, setProError] = useState<string | null>(null);

  const loginHref = `/login?next=${encodeURIComponent(pathname === "/" ? "/pricing" : pathname)}`;

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiFetch<{ plan: string }>("/auth/me");
        setSession({
          kind: "in",
          plan: me.plan === "pro" ? "pro" : "free",
        });
      } catch {
        setSession({ kind: "out" });
      }
    };
    void load();
    const onAuth = () => void load();
    window.addEventListener("vexis-auth-changed", onAuth);
    return () => window.removeEventListener("vexis-auth-changed", onAuth);
  }, []);

  const confirmPro = useCallback(async () => {
    setProError(null);
    setProSubmitting(true);
    try {
      await apiFetch("/auth/upgrade-pro", { method: "POST" });
      window.dispatchEvent(new Event("vexis-auth-changed"));
      setProModalOpen(false);
      router.push("/dashboard");
    } catch (err) {
      setProError(
        err instanceof Error ? err.message : "Could not enable Pro. Try again.",
      );
    } finally {
      setProSubmitting(false);
    }
  }, [router]);

  return (
    <>
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
                <div
                  className={
                    t.featured
                      ? "text-xs text-white/70"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {t.note}
                </div>
              </div>
            </div>

            <motion.ul
              className={[
                "mt-7 space-y-3 text-sm",
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

            <div className="mt-8">
              {t === proTier ? (
                session.kind === "loading" ? (
                  <div
                    className="h-11 w-full animate-pulse rounded-full bg-white/25"
                    aria-hidden
                  />
                ) : session.kind === "out" ? (
                  <Link href={loginHref} className={proCtaClassName}>
                    {t.cta}
                  </Link>
                ) : session.plan === "pro" ? (
                  <Link href="/dashboard" className={proCtaClassName}>
                    {t.cta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setProError(null);
                      setProModalOpen(true);
                    }}
                    className={proCtaClassName}
                  >
                    {t.cta}
                  </button>
                )
              ) : (
                <Link
                  href={freeTier.href}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full border border-foreground bg-white px-5 text-sm font-semibold text-foreground transition shadow-sm hover:bg-surface"
                >
                  {t.cta}
                </Link>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {proModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={() => !proSubmitting && setProModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pro-modal-title"
            className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-white p-6 shadow-lg"
          >
            <h2
              id="pro-modal-title"
              className="font-[var(--font-display)] text-xl font-semibold tracking-[-0.03em] text-foreground"
            >
              Enable Pro on your account?
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Billing is not connected yet. If you confirm, we will mark your
              account as Pro so you can try Pro features and navigation.
            </p>
            {proError ? (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {proError}
              </div>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={proSubmitting}
                onClick={() => setProModalOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-white px-5 text-sm font-semibold text-foreground transition hover:bg-surface disabled:opacity-50"
              >
                Not now
              </button>
              <button
                type="button"
                disabled={proSubmitting}
                onClick={() => void confirmPro()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-60"
              >
                {proSubmitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Enabling…
                  </>
                ) : (
                  "Yes, enable Pro"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

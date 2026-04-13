"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Container } from "./Container";
import { apiFetch } from "@/lib/api";

const navPublic = [
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [scrolled, setScrolled] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);

  const items = useMemo(() => {
    const base = [...navPublic];
    if (authed) {
      base.push({ href: "/profile", label: "Profile" });
      base.push({ href: "/dashboard", label: "Dashboard" });
      base.push({ href: "/twitter", label: "Twitter AI" });
    }
    return base;
  }, [authed]);

  useEffect(() => {
    const check = async () => {
      try {
        const me = await apiFetch<{ plan: string }>("/auth/me");
        setAuthed(true);
        setPlan(me.plan === "pro" ? "pro" : "free");
      } catch {
        setAuthed(false);
        setPlan(null);
      }
    };
    check();

    const onAuthChanged = () => check();
    window.addEventListener("vexis-auth-changed", onAuthChanged);
    return () =>
      window.removeEventListener("vexis-auth-changed", onAuthChanged);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new Event("vexis-auth-changed"));
  }, [pathname]);

  return (
    <div className="sticky top-0 z-50">
      <header
        className={[
          "bg-white",
          scrolled
            ? "border-b border-border bg-white/80 backdrop-blur-[12px] supports-[backdrop-filter]:bg-white/80"
            : "border-b border-transparent",
        ].join(" ")}
      >
        <Container>
          <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2"
              aria-label="Vexis home"
            >
              <span className="font-[var(--font-display)] text-base font-semibold tracking-[-0.02em] text-foreground">
                VEXIS
              </span>
            </Link>

            <nav className="hidden items-center justify-center gap-8 md:flex">
              {items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={`${item.href}-${item.label}`}
                    href={item.href}
                    className={[
                      "text-sm font-medium transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center justify-end gap-2">
              <details className="relative md:hidden">
                <summary className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-white px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white [&::-webkit-details-marker]:hidden">
                  Menu
                </summary>
                <div className="absolute right-0 mt-3 w-60 overflow-hidden rounded-xl border border-border bg-white p-2 shadow-lg">
                  <div className="grid">
                    {items.map((item) => (
                      <Link
                        key={`${item.href}-${item.label}-m`}
                        href={item.href}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                      >
                        {item.label}
                      </Link>
                    ))}
                    {authed && plan === "free" ? (
                      <Link
                        href="/pricing"
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-accent"
                      >
                        Upgrade
                      </Link>
                    ) : null}
                    {authed ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiFetch("/auth/logout", { method: "POST" });
                          } finally {
                            window.dispatchEvent(new Event("vexis-auth-changed"));
                            router.push("/login");
                          }
                        }}
                        className="mt-1 inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                      >
                        Logout
                      </button>
                    ) : (
                      <div className="mt-1 grid gap-2">
                        <Link
                          href="/login"
                          className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-surface"
                        >
                          Login
                        </Link>
                        <Link
                          href="/register"
                          className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-4 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                        >
                          Get Started
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </details>

              {authed && plan === "free" ? (
                <Link
                  href="/pricing"
                  className="hidden md:inline-flex h-10 items-center justify-center rounded-full border border-accent px-4 text-sm font-semibold text-accent transition hover:bg-accent/10"
                >
                  Upgrade
                </Link>
              ) : null}

              {authed ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiFetch("/auth/logout", { method: "POST" });
                    } finally {
                      window.dispatchEvent(new Event("vexis-auth-changed"));
                      router.push("/login");
                    }
                  }}
                  className="hidden md:inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  Logout
                </button>
              ) : (
                <div className="hidden items-center gap-2 md:flex">
                  <Link
                    href="/login"
                    className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-surface"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </div>
          </div>
        </Container>
      </header>
    </div>
  );
}

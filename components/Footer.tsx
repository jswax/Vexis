import Link from "next/link";

import { Container } from "./Container";

const columns: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/login", label: "Get Started" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/about", label: "Careers" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "Docs" },
      { href: "/about", label: "Changelog" },
      { href: "/contact", label: "Support" },
    ],
  },
  {
    title: "Social",
    links: [
      { href: "/about", label: "X" },
      { href: "/about", label: "YouTube" },
      { href: "/about", label: "Discord" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-white">
      <Container>
        <div className="grid gap-10 py-14 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="font-[var(--font-display)] text-base font-semibold tracking-[-0.02em] text-foreground">
              VEXIS
            </div>
            <p className="mt-4 max-w-sm text-sm text-muted-foreground">
              Placeholder tagline for a high-end fintech trading indicator
              product.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:col-span-8 lg:grid-cols-3">
            {columns.map((c) => (
              <div key={c.title}>
                <div className="text-xs font-semibold tracking-[0.15em] text-foreground">
                  {c.title.toUpperCase()}
                </div>
                <ul className="mt-4 grid gap-2">
                  {c.links.map((l) => (
                    <li key={`${c.title}-${l.label}`}>
                      <Link
                        href={l.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} Vexis. All rights reserved.</span>
          <span>Built for traders.</span>
        </div>
      </Container>
    </footer>
  );
}


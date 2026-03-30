import { type ReactNode } from "react";

import { Container } from "./Container";

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-border bg-white">
      <Container>
        <div className="py-12 md:py-16">
          {eyebrow ? (
            <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mt-5 font-[var(--font-display)] text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-foreground sm:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
              {description}
            </p>
          ) : null}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </Container>
    </section>
  );
}


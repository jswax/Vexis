"use client";

import dynamic from "next/dynamic";

const PriceChart = dynamic(() => import("./PriceChart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <div className="h-44 w-full rounded-2xl bg-white" />,
});

export function DashboardCard() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[32px] bg-[radial-gradient(55%_55%_at_70%_40%,rgba(37,99,235,0.04),transparent_70%)]" />

      <div className="rounded-2xl border border-border bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
              LIVE DASHBOARD
            </div>
          </div>
          <div className="text-xs font-medium text-muted-foreground">
            Placeholder
          </div>
        </div>

        <div className="grid gap-5 p-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { k: "Signal", v: "Long" },
              { k: "Confidence", v: "—" },
              { k: "Regime", v: "—" },
            ].map((m) => (
              <div key={m.k} className="rounded-xl bg-surface px-4 py-3">
                <div className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground">
                  {m.k.toUpperCase()}
                </div>
                <div className="mt-1 text-sm font-semibold tracking-[-0.01em] text-foreground">
                  {m.v}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-xs font-semibold tracking-[0.15em] text-muted-foreground">
                PRICE ACTION
              </div>
              <div className="text-xs font-medium text-accent">
                Entry/Exit markers
              </div>
            </div>

            <div className="mt-3 h-44 w-full">
              <PriceChart />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Placeholder alert
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
              Placeholder filter
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}


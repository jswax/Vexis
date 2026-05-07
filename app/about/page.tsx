import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";

export default function AboutPage() {
  return (
    <div>
      <PageHeader
        eyebrow="ABOUT"
        title="Built for precision."
        description="We obsess over signal quality so you don't have to."
      />
      <Container>
        <div className="py-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="rounded-2xl border border-border bg-white p-8 shadow-sm">
                <div className="grid gap-6 text-sm leading-7 text-muted-foreground">
                  <p>
                    Vexis is a precision trading indicator built for serious traders on
                    TradingView. We believe trading tools should be simple, transparent,
                    and reliable — not cluttered with noise that costs you money.
                  </p>
                  <p>
                    The indicator is built on multi-timeframe confluence logic and
                    real-time market regime detection. It filters out low-quality setups
                    and surfaces only the entries worth taking — so you can focus on
                    execution rather than interpretation.
                  </p>
                  <p>
                    We build for disciplined traders. No guesswork, no repainting, no
                    clutter. Just clean signals and a consistent process you can trust
                    session after session.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="grid gap-4">
                {[
                  { label: "Built on", value: "TradingView" },
                  { label: "Signal type", value: "Multi-timeframe confluence" },
                  { label: "Markets", value: "All asset classes" },
                  { label: "Repainting", value: "Never" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-xl border border-border bg-white px-5 py-4 shadow-sm"
                  >
                    <span className="text-sm font-medium text-muted-foreground">
                      {item.label}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}

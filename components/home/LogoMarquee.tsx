import { Container } from "@/components/Container";

const logos = [
  "Forex",
  "Crypto",
  "Futures",
  "Equities",
  "Options",
  "Indices",
  "Commodities",
];

export function LogoMarquee() {
  return (
    <section className="bg-white">
      <Container>
        <div className="py-12">
          <div className="text-sm font-medium text-muted-foreground">
            Works across all markets
          </div>

          <div className="mt-6 overflow-hidden">
            <div className="vexis-marquee flex gap-10 py-2">
              {[...logos, ...logos].map((l, i) => (
                <div
                  key={`${l}-${i}`}
                  className="shrink-0 text-sm font-semibold tracking-[-0.01em] text-muted-foreground/70 grayscale"
                >
                  {l.toUpperCase()}
                </div>
              ))}
            </div>
          </div>

          <style>{`
            .vexis-marquee {
              width: max-content;
              animation: vexis-marquee 28s linear infinite;
            }
            @keyframes vexis-marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </div>
      </Container>
    </section>
  );
}


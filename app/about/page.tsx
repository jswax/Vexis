import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";

export default function AboutPage() {
  return (
    <div>
      <PageHeader
        eyebrow="ABOUT"
        title="Built for precision."
        description="Placeholder copy for the Vexis about page."
      />
      <Container>
        <div className="py-12">
          <div className="rounded-2xl border border-border bg-white p-6 text-muted-foreground shadow-sm">
            Placeholder content.
          </div>
        </div>
      </Container>
    </div>
  );
}


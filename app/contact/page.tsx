import { Container } from "@/components/Container";
import { PageHeader } from "@/components/PageHeader";

function Field({
  label,
  name,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  type?: "text" | "email";
  placeholder: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
        {label}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        className="h-11 rounded-md border border-border bg-white px-4 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      />
    </label>
  );
}

export default function ContactPage() {
  return (
    <div>
      <PageHeader
        eyebrow="CONTACT"
        title="Let’s talk."
        description="Placeholder copy. Frontend-only contact form UI."
      />
      <Container>
        <div className="py-12">
          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Contact details
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  Placeholder copy for contact details. No backend wiring.
                </p>
                <div className="mt-6 grid gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                    <span>Email</span>
                    <span className="text-muted-foreground">
                      placeholder@vexis.dev
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                    <span>Response time</span>
                    <span className="text-muted-foreground">—</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <form className="rounded-2xl border border-border bg-white p-6 shadow-sm">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="NAME"
                    name="name"
                    placeholder="Placeholder name"
                  />
                  <Field
                    label="EMAIL"
                    name="email"
                    type="email"
                    placeholder="placeholder@email.com"
                  />
                </div>

                <label className="mt-5 grid gap-2">
                  <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                    MESSAGE
                  </span>
                  <textarea
                    name="message"
                    placeholder="Placeholder message"
                    rows={6}
                    className="resize-none rounded-md border border-border bg-white px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  />
                </label>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    Placeholder disclaimer text.
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  >
                    Send message
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}


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
        title="Let's talk."
        description="Have a question or need help getting started? We're here."
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
                  Reach out with any questions about the indicator, your subscription,
                  or TradingView access.
                </p>
                <div className="mt-6 grid gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                    <span>Email</span>
                    <span className="font-medium text-foreground">
                      support@vexis.com
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                    <span>Response time</span>
                    <span className="font-medium text-foreground">Within 24 hours</span>
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
                    placeholder="Your name"
                  />
                  <Field
                    label="EMAIL"
                    name="email"
                    type="email"
                    placeholder="you@email.com"
                  />
                </div>

                <label className="mt-5 grid gap-2">
                  <span className="text-xs font-semibold tracking-[0.22em] text-muted-foreground">
                    MESSAGE
                  </span>
                  <textarea
                    name="message"
                    placeholder="How can we help?"
                    rows={6}
                    className="resize-none rounded-md border border-border bg-white px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  />
                </label>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    We respond to all inquiries within 24 hours.
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

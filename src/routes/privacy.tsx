import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicy,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <header className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
          <h1 className="mt-3 font-display text-3xl font-bold">Privacy Policy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            FundiFast · Last updated:{" "}
            {new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </p>
        </header>

        <div className="space-y-6">
          <Section title="1. Overview">
            <p>
              This Privacy Policy explains how FundiFast ("we", "us") collects, uses, and protects
              your personal data when you use our platform to connect with trusted local fundis
              (technicians) in Tanzania.
            </p>
            <p>By using FundiFast, you agree to the practices described in this policy.</p>
          </Section>

          <Section title="2. Data we collect">
            <p>We collect only the information needed to provide and improve our service:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account details</strong> — your name, email address, phone number, and role
                (Client or Fundi).
              </li>
              <li>
                <strong>Job information</strong> — the problem you describe, photos you upload,
                quotes, and job status updates.
              </li>
              <li>
                <strong>Location</strong> — your approximate location while a job is active, so we
                can match you with nearby fundis and track arrivals.
              </li>
              <li>
                <strong>Payment and rating records</strong> — transaction summaries and ratings you
                leave after a job.
              </li>
            </ul>
          </Section>

          <Section title="3. How we use your data">
            <p>Your data is used strictly for the purpose of operating the service:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Creating and managing your account.</li>
              <li>Matching clients with nearby fundis and processing quotes and bookings.</li>
              <li>Showing live job progress, arrival, and payment information.</li>
              <li>Ensuring safety, preventing fraud, and providing support.</li>
            </ul>
          </Section>

          <Section title="4. Your data is never exported or sold">
            <p>
              We do <strong>not</strong> sell, rent, trade, or otherwise export your personal data
              to any third party for advertising, marketing, or any commercial purpose. Your
              information stays within the FundiFast platform and is only ever used to deliver the
              service you asked for.
            </p>
            <p>
              We will never share your personal data with any party outside FundiFast for their own
              independent use.
            </p>
          </Section>

          <Section title="5. Technical service providers">
            <p>
              To run the platform we rely on a small number of technical providers (for example,
              secure cloud hosting, map and routing services, and email delivery). These providers
              only process data on our behalf, under written agreements that require them to protect
              your data and prevent any independent use. They receive only the minimum information
              necessary to perform the task.
            </p>
          </Section>

          <Section title="6. Data retention">
            <p>
              We keep your personal data only as long as necessary to provide the service, comply
              with legal obligations, and resolve disputes. Job records and financial summaries may
              be retained for a reasonable period for accounting and safety purposes.
            </p>
          </Section>

          <Section title="7. Your rights">
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Access</strong> the personal data we hold about you.
              </li>
              <li>
                <strong>Correct</strong> inaccurate or outdated information.
              </li>
              <li>
                <strong>Delete</strong> your account and the data associated with it, subject to
                legal or accounting requirements.
              </li>
              <li>
                <strong>Export</strong> your own data — we will gladly provide a copy of the
                information you shared with us.
              </li>
              <li>
                <strong>Withdraw consent</strong> for optional data, such as location.
              </li>
            </ul>
          </Section>

          <Section title="8. Security">
            <p>
              We use industry-standard security measures — including encrypted connections and
              restricted access controls — to protect your personal data against unauthorised
              access, alteration, or disclosure.
            </p>
          </Section>

          <Section title="9. Children">
            <p>
              FundiFast is intended for users aged 18 and over. We do not knowingly collect personal
              data from children.
            </p>
          </Section>

          <Section title="10. Changes to this policy">
            <p>
              We may update this policy from time to time. We will post any changes on this page and
              update the "Last updated" date above.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              If you have any questions about this policy or your data, please contact us through
              the FundiFast platform. We aim to respond within a reasonable time.
            </p>
          </Section>
        </div>

        <p className="mt-10 border-t pt-6 text-xs text-muted-foreground">
          FundiFast — connecting clients with trusted local fundis in Tanzania.
        </p>
      </div>
    </div>
  );
}

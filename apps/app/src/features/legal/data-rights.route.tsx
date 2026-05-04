import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { TypographyH1, TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const dataRightsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "legal/data-rights",
  component: DataRightsPage,
});

function DataRightsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <TypographyH1>Your data rights</TypographyH1>
        <TypographyMuted>
          GDPR Art. 13/14 transparency disclosure. Last updated on the date this page was deployed.
        </TypographyMuted>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Right to portability (Art. 20)</CardTitle>
          <CardDescription>
            Get a copy of your data, machine-readable, free of charge.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p>
            From <strong>Settings → Account</strong>, request a data export. We email you a signed
            download link valid for 7 days. The archive is a JSON document containing your account
            profile, session metadata, organization memberships, and invitations you sent.
          </p>
          <TypographyMuted>Limited to one export request per 24 hours per account.</TypographyMuted>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Right to erasure (Art. 17)</CardTitle>
          <CardDescription>
            Delete your account, with a 7-day grace window in case you change your mind.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <TypographyH2>What gets deleted</TypographyH2>
            <ul className="ml-6 list-disc">
              <li>Your name and profile image</li>
              <li>All active sessions, OAuth account links, and passkeys</li>
              <li>Two-factor authentication factors and backup codes</li>
              <li>Files you uploaded under your storage prefix</li>
              <li>Personal organization (auto-created on signup, tied 1:1 to you)</li>
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <TypographyH2>What gets anonymized</TypographyH2>
            <ul className="ml-6 list-disc">
              <li>
                Your user row stays in the database with a placeholder email like{" "}
                <code>deleted-&lt;uuid&gt;@anonymized.local</code> and a tombstone name. This keeps
                referential integrity for any historical records that legally must persist.
              </li>
              <li>
                Invitations you sent and team memberships are dropped; references in remaining org
                rows lose your identifying details.
              </li>
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <TypographyH2>What is retained</TypographyH2>
            <ul className="ml-6 list-disc">
              <li>
                Audit log entries linked to your past actions are retained for legal compliance,
                with the actor reference becoming a tombstone (no PII).
              </li>
              <li>
                Organizations where you are a member but not the only owner remain intact —
                membership rows referencing you are removed.
              </li>
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <TypographyH2>Pre-flight ownership check</TypographyH2>
            <p>
              If you are the sole owner of a non-personal organization that has other members, you
              must first transfer ownership or delete that organization. We do not auto-transfer
              ownership — that decision belongs to you.
            </p>
          </section>
          <section className="flex flex-col gap-2">
            <TypographyH2>Grace window</TypographyH2>
            <p>
              After confirming deletion, your account enters a <strong>7-day grace window</strong>.
              You can sign in during this period and cancel the deletion. After the grace expires,
              the wipe is irreversible.
            </p>
          </section>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Right to access, rectification, restriction, objection</CardTitle>
        </CardHeader>
        <CardContent>
          <p>
            For other rights guaranteed by GDPR Art. 15/16/18/21 — including correcting inaccurate
            data, restricting processing, or objecting to specific uses — contact your data
            protection officer. (Replace this paragraph with your DPO contact details when forking
            this boilerplate.)
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

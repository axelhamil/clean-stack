import { TextLink } from "@packages/ui/components/ui/text-link";
import {
  TypographyH2,
  TypographyH3,
  TypographyList,
  TypographyMuted,
  TypographyP,
} from "@packages/ui/components/ui/typography";
import type { ReactElement } from "react";

// The canonical English body for each policy. `fr.tsx` re-exports these
// verbatim today — see that file's comment and R3 in the extraction recipe
// for why the prose itself never enters the i18n catalog.
export function PrivacyPolicyBody(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <TypographyP>
        <strong>
          This is boilerplate placeholder prose. Replace with your actual Privacy Policy before
          going to production.
        </strong>
      </TypographyP>

      <section className="flex flex-col gap-3">
        <TypographyH2>1. Data We Collect</TypographyH2>
        <TypographyP className="my-0">
          We collect information you provide directly (name, email address, password) and
          information generated through your use of the service (session data, usage logs, IP
          addresses). We do not sell your personal data to third parties.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>2. How We Use Your Data</TypographyH2>
        <TypographyList className="my-0">
          <li>To provide and improve the service.</li>
          <li>To authenticate you and maintain session security.</li>
          <li>To send transactional emails (account verification, password reset).</li>
          <li>To comply with legal obligations (RGPD Art. 6 — legitimate interest / consent).</li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>3. Data Retention</TypographyH2>
        <TypographyP className="my-0">
          Account data is retained for the duration of your account. You may request deletion at any
          time via Settings → Account. Audit records tied to legal compliance may be retained longer
          per applicable law, with PII anonymized.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>4. Your Rights (RGPD)</TypographyH2>
        <TypographyP className="my-0">
          You have the right to access, rectify, erase, restrict, and port your data. See the{" "}
          <TextLink href="/legal/data-rights">Data Rights</TextLink> page for procedures. Contact
          your Data Protection Officer (DPO) for formal requests — replace this paragraph with
          actual DPO contact details when forking this boilerplate.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>5. Cookies</TypographyH2>
        <TypographyP className="my-0">
          We use strictly necessary HTTP-only cookies for authentication. No tracking or advertising
          cookies. No third-party analytics without explicit consent.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>6. Contact</TypographyH2>
        <TypographyMuted>Replace with your organization's legal contact details.</TypographyMuted>
      </section>
    </div>
  );
}

export function TermsBody(): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <TypographyP>
        <strong>
          This is boilerplate placeholder prose. Replace with your actual Terms of Service before
          going to production.
        </strong>
      </TypographyP>

      <section className="flex flex-col gap-3">
        <TypographyH2>1. Acceptance</TypographyH2>
        <TypographyP className="my-0">
          By creating an account you agree to these Terms. If you do not agree, do not use the
          service. We may update these Terms; continued use after the effective date constitutes
          acceptance of the revised Terms.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>2. Permitted Use</TypographyH2>
        <TypographyList className="my-0">
          <li>You must be 16 years or older to create an account.</li>
          <li>You may not use the service for illegal purposes or to harm others.</li>
          <li>You are responsible for all activity under your account.</li>
          <li>You must keep your credentials confidential.</li>
        </TypographyList>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>3. Intellectual Property</TypographyH2>
        <TypographyP className="my-0">
          The service and its original content remain the property of the provider. You retain
          ownership of data you submit. You grant us a limited license to process your data to
          deliver the service.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>4. Service Availability</TypographyH2>
        <TypographyP className="my-0">
          We strive for high availability but do not guarantee uninterrupted access. We reserve the
          right to suspend or terminate accounts that violate these Terms.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH2>5. Limitation of Liability</TypographyH2>
        <TypographyP className="my-0">
          To the extent permitted by law, our liability is limited to the amount you paid us in the
          past twelve months. Replace with your jurisdiction-appropriate clause.
        </TypographyP>
      </section>

      <section className="flex flex-col gap-3">
        <TypographyH3>Sections to complete</TypographyH3>
        <TypographyList className="my-0">
          <li>Governing law and dispute resolution</li>
          <li>Indemnification</li>
          <li>Payment terms (if applicable)</li>
          <li>Service-level commitments</li>
        </TypographyList>
      </section>
    </div>
  );
}

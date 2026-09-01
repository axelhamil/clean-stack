import { CodeBlock } from "@packages/ui/components/ui/code-block";
import { Panel } from "@packages/ui/components/ui/panel";
import { useTranslation } from "react-i18next";

const SNIPPET = `import crypto from "node:crypto";

// Header: x-webhook-signature: t=<ts>,v1=<sig>[,v1=<sig>]
// Signed string: "\${ts}.\${rawBody}" where rawBody is the raw POST body string.
// During secret rotation two v1= signatures are present — accept if ANY matches.
const TOLERANCE_SECONDS = 300;

export function verify(rawBody: string, header: string, secret: string): boolean {
  const ts = header.match(/t=([^,]+)/)?.[1];
  if (!ts) return false;
  // The signature covers the timestamp, so a captured request stays valid until the
  // secret rotates. Rejecting stale timestamps is what makes a replay useless.
  const sentAt = Number(ts);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > TOLERANCE_SECONDS) {
    return false;
  }
  const signed = \`\${ts}.\${rawBody}\`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  const provided = header.match(/v1=([0-9a-f]+)/g)?.map((m) => m.slice(3)) ?? [];
  return provided.some(
    (sig) =>
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
  );
}`;

export function VerifySnippet() {
  const { t } = useTranslation("settings");

  return (
    <Panel asChild>
      <details>
        <summary className="cursor-pointer text-sm font-medium">
          {t("webhooks.verifySnippetHeading")}
        </summary>
        <CodeBlock className="mt-3">
          <code>{SNIPPET}</code>
        </CodeBlock>
      </details>
    </Panel>
  );
}

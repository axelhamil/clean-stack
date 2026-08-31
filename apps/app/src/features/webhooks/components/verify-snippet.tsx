import { useTranslation } from "react-i18next";

const SNIPPET = `import crypto from "node:crypto";

// Header: x-webhook-signature: t=<ts>,v1=<sig>[,v1=<sig>]
// Signed string: "\${ts}.\${rawBody}" where rawBody is the raw POST body string.
// During secret rotation two v1= signatures are present — accept if ANY matches.
export function verify(rawBody: string, header: string, secret: string): boolean {
  const ts = header.match(/t=([^,]+)/)?.[1];
  if (!ts) return false;
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
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {t("webhooks.verifySnippetHeading")}
      </summary>
      <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs">
        <code>{SNIPPET}</code>
      </pre>
    </details>
  );
}

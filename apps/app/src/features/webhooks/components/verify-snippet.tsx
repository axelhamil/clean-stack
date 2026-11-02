import { Button } from "@packages/ui/components/ui/button";
import { CodeBlock } from "@packages/ui/components/ui/code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@packages/ui/components/ui/collapsible";
import { ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const SNIPPET = `import crypto from "node:crypto";

// Header: x-webhook-signature: t=<ts>,v1=<sig>[,v1=<sig>]
// Signed string: "\${ts}.\${rawBody}" where rawBody is the raw POST body string.
// During secret rotation two v1= signatures are present: accept if ANY matches.
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
    <Collapsible className="flex min-w-0 flex-col items-start gap-2">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group">
          <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
          {t("webhooks.verifySnippetHeading")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="w-full">
        <CodeBlock>
          <code>{SNIPPET}</code>
        </CodeBlock>
      </CollapsibleContent>
    </Collapsible>
  );
}

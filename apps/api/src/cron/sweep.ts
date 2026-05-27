import { signedInternalFetch } from "../shared/internal-routes/internal-fetch";

const baseUrl = process.env.API_URL;
const signingKey = process.env.INTERNAL_SIGNING_KEY;

if (!baseUrl) throw new Error("API_URL is required");
if (!signingKey || signingKey.length < 32) {
  throw new Error("INTERNAL_SIGNING_KEY is required (min 32 chars)");
}

const sweeps = [
  "/internal/sweep-webhook-delivery",
  "/internal/sweep-audit-log",
  "/internal/sweep-outbox",
] as const;

for (const path of sweeps) {
  const started = Date.now();
  const res = await signedInternalFetch({
    baseUrl,
    method: "POST",
    path,
    body: { dryRun: false },
    signingKey,
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(
      `[sweep] FAIL ${path} → ${res.status} in ${Date.now() - started}ms: ${body.slice(0, 500)}`,
    );
    process.exit(1);
  }
  console.log(`[sweep] OK ${path} in ${Date.now() - started}ms: ${body}`);
}

process.exit(0);

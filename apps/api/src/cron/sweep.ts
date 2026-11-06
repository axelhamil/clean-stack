import { loadCronEnv } from "./env";
import { runInternalJob } from "./internal-job";

const env = loadCronEnv();

await runInternalJob({
  env,
  label: "sweep",
  paths: [
    "/internal/sweep-email-messages",
    "/internal/sweep-webhook-delivery",
    "/internal/sweep-audit-log",
    "/internal/sweep-outbox",
    "/internal/sweep-consents",
    "/internal/sweep-notifications",
    "/internal/sweep-admin-approvals",
    "/internal/sweep-admin-impersonations",
    "/internal/sweep-stripe-events",
  ],
  heartbeatUrl: env.SWEEP_HEARTBEAT_URL,
});

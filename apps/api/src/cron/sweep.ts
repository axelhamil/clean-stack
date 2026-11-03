import { runInternalJob } from "./internal-job";

await runInternalJob({
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
  heartbeatUrl: process.env.SWEEP_HEARTBEAT_URL,
});

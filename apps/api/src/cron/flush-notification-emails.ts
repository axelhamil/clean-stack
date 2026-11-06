import { loadCronEnv } from "./env";
import { runInternalJob } from "./internal-job";

await runInternalJob({
  env: loadCronEnv(),
  label: "flush-notification-emails",
  paths: ["/internal/flush-notification-emails"],
});

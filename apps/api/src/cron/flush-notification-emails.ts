import { runInternalJob } from "./internal-job";

await runInternalJob({
  label: "flush-notification-emails",
  paths: ["/internal/flush-notification-emails"],
});

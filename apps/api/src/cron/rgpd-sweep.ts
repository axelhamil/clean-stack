import { runInternalJob } from "./internal-job";

await runInternalJob({ label: "rgpd-sweep", paths: ["/internal/rgpd-sweep"] });

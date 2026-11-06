import { loadCronEnv } from "./env";
import { runInternalJob } from "./internal-job";

await runInternalJob({ env: loadCronEnv(), label: "rgpd-sweep", paths: ["/internal/rgpd-sweep"] });

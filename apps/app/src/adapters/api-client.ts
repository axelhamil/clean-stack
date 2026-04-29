import type { AppType } from "api";
import { hc } from "hono/client";
import { env } from "../../common/env";

export const api = hc<AppType>(env.VITE_API_URL, {
  init: { credentials: "include" },
});

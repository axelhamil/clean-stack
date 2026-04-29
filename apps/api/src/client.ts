import { hc } from "hono/client";
import type { AppType } from "./index";

export type ApiClient = ReturnType<typeof hc<AppType>>;

export const hcWithType = (...args: Parameters<typeof hc<AppType>>): ApiClient =>
  hc<AppType>(...args);

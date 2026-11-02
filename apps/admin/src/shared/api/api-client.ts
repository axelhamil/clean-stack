import { createApiClient } from "@packages/web-kit/api/api-client";
import { type ApiClient, hcWithType } from "api/client";
import { env } from "../env";

export const api: ApiClient = createApiClient(env.VITE_API_URL, hcWithType);

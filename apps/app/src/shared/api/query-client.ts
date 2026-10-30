import { createQueryClient } from "@packages/web-kit/api/query-client";
import { captureError } from "../observability/sentry";

export const queryClient = createQueryClient(captureError);

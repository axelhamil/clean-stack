import { pinoLogger } from "hono-pino";
import { logger } from "../../../common/logger";

export const httpLogger = pinoLogger({
  pino: logger,
  http: {
    referRequestIdKey: "requestId",
    onReqLevel: () => "info",
    onResLevel: (c) => {
      if (c.res.status >= 500) return "error";
      if (c.res.status >= 400) return "warn";
      return "info";
    },
    onReqBindings: (c) => ({
      req: { method: c.req.method, url: c.req.path },
    }),
    onResBindings: (c) => ({
      res: { status: c.res.status },
    }),
  },
});

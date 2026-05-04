import { pino } from "pino";
import { env } from "./env";

const isProd = env.NODE_ENV === "production";

export const logger = pino({
  level: isProd ? "info" : "debug",
  base: { env: env.NODE_ENV },
  ...(isProd
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,env",
            singleLine: true,
          },
        },
      }),
});

export type Logger = typeof logger;

import { pino } from "pino";
import { env } from "./env";

const isProd = env.NODE_ENV === "production";
const isTest = env.NODE_ENV === "test";

// `pino-pretty` ships log lines to a worker thread. A test run gives every file its
// own module registry, so the transport would be spawned — and torn down — once per
// file, and the teardown race surfaces as "the worker thread exited" errors attached
// to whichever test happened to be running. Under test the logger stays in-process
// and silent: no test asserts on its output, it only receives it as a collaborator.
const level = isProd ? "info" : isTest ? "silent" : "debug";

export const logger = pino({
  level,
  base: { env: env.NODE_ENV },
  ...(isProd || isTest
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

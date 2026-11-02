import { describe, expect, it } from "bun:test";
import { APP_SRC, listFrontConsumers } from "../front-consumers";

const ALLOWED_ADMIN_CALLS = ["POST /admin/impersonation/stop"];

describe("admin calls from the customer app", () => {
  it("are limited to ending an impersonation", () => {
    const calls = listFrontConsumers([APP_SRC])
      .map((consumer) => consumer.route)
      .filter((route) => route.split(" ")[1]?.startsWith("/admin/"));

    expect([...new Set(calls)].sort()).toEqual([...ALLOWED_ADMIN_CALLS].sort());
  });
});

import { describe, expect, mock, test } from "bun:test";
import * as realDrizzle from "@packages/drizzle";

const fakeSql = Object.assign(
  (strings: TemplateStringsArray) => ({
    toSQL: () => ({ sql: strings.join(""), params: [] as unknown[] }),
  }),
  {
    raw: (_s: string) => ({}),
    identifier: (_s: string) => ({}),
  },
);

// The DDL has no interpolation, so joining the template's literal parts yields the
// exact statement text; `@packages/drizzle` exposes no dialect to render a real `sql`.
mock.module("@packages/drizzle", () => ({ ...realDrizzle, sql: fakeSql }));

const { ensureNotificationTrigger, NOTIFICATION_NOTIFY_CHANNEL } = await import(
  "../notification-trigger"
);

describe("ensureNotificationTrigger", () => {
  function makeClient() {
    const executed: Array<{ toSQL: () => { sql: string } }> = [];
    const client = {
      execute: mock(async (query: { toSQL: () => { sql: string } }) => {
        executed.push(query);
      }),
    };
    return { client, executed };
  }

  test("issues the expected DDL through execute", async () => {
    const { client, executed } = makeClient();

    await ensureNotificationTrigger(client as never);

    expect(client.execute).toHaveBeenCalledTimes(3);

    const fnDdl = executed[0]?.toSQL().sql ?? "";
    const insertDdl = executed[1]?.toSQL().sql ?? "";
    const readDdl = executed[2]?.toSQL().sql ?? "";

    expect(fnDdl).toContain("CREATE OR REPLACE");
    expect(fnDdl).toContain("notification_changed");
    expect(fnDdl).toContain("NEW.user_id");

    expect(insertDdl).toContain("CREATE OR REPLACE");
    expect(insertDdl).toContain("notification_notify_trigger");
    expect(insertDdl).toContain("AFTER INSERT ON notification");

    expect(readDdl).toContain("notification_read_notify_trigger");
    expect(readDdl).toContain("AFTER UPDATE OF read_at ON notification");
    expect(readDdl).toContain("OLD.read_at IS DISTINCT FROM NEW.read_at");
  });

  test("the read signal uses the same channel as creation", () => {
    expect(NOTIFICATION_NOTIFY_CHANNEL).toBe("notification_changed");
  });

  test("is idempotent: two calls do not throw", async () => {
    const { client } = makeClient();

    await ensureNotificationTrigger(client as never);
    await ensureNotificationTrigger(client as never);

    expect(client.execute).toHaveBeenCalledTimes(6);

    const sqls = (client.execute as ReturnType<typeof mock>).mock.calls.map(
      (c) => (c[0] as { toSQL: () => { sql: string } }).toSQL().sql,
    );
    for (const s of sqls) {
      expect(s).toContain("CREATE OR REPLACE");
    }
  });
});

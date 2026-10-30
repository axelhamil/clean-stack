import { describe, expect, it } from "bun:test";
import { UnitOfWorkContext } from "@packages/ddd-kit";
import { schema } from "@packages/drizzle";
import type { Logger } from "../../../shared/logger";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { DrizzleRgpdRepository } from "../infrastructure/repositories/drizzle-rgpd.repository";

function repository() {
  return new DrizzleRgpdRepository(
    { error: () => {} } as unknown as Logger,
    new NoOpInstrumentation(),
  );
}

function exportTables(sessionRow: Record<string, unknown>) {
  const at = new Date("2026-10-30T12:00:00Z");
  const userRow = {
    id: "u1",
    name: "A",
    email: "a@example.com",
    emailVerified: true,
    image: null,
    createdAt: at,
    updatedAt: at,
    twoFactorEnabled: false,
  };

  return {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const rows =
          table === schema.user ? [userRow] : table === schema.session ? [sessionRow] : [];
        const projected = fields
          ? rows.map((row) =>
              Object.fromEntries(
                Object.keys(fields).map((key) => [
                  key,
                  Object.entries(row).find(([k]) => k === key)?.[1],
                ]),
              ),
            )
          : rows;
        const chain = {
          where: () => chain,
          limit: () => chain,
          innerJoin: () => chain,
          execute: async () => projected,
        };

        return chain;
      },
    }),
  } as never;
}

describe("DrizzleRgpdRepository.collectUserDataForExport", () => {
  it("given a session with a stored country, then the export discloses it", async () => {
    const at = new Date("2026-10-30T12:00:00Z");

    const result = await UnitOfWorkContext.run(
      exportTables({
        id: "s1",
        createdAt: at,
        expiresAt: at,
        ipAddress: "203.0.113.1",
        country: "FR",
        userAgent: null,
      }),
      () => repository().collectUserDataForExport("u1"),
    );

    expect(result.getValue().sessions[0]?.country).toBe("FR");
  });
});

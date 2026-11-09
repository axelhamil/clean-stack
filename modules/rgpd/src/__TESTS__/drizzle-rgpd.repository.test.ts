import { describe, expect, it } from "bun:test";
import { type AppError, type ILogger, Result, UnitOfWorkContext } from "@packages/ddd-kit";
import { schema } from "@packages/drizzle";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { IApiTokenRevoker } from "../application/ports/api-token-revoker.port";
import type { IEndedSessionsReader } from "../application/ports/ended-sessions.port";
import type { IStaffDataEraser } from "../application/ports/staff-data-eraser.port";
import { DrizzleRgpdRepository } from "../infrastructure/repositories/drizzle-rgpd.repository";

function repository() {
  return new DrizzleRgpdRepository(
    mockPort<ILogger>(),
    mockInstrumentation(),
    mockPort<IApiTokenRevoker>(),
    mockPort<IStaffDataEraser>(),
    mockPort<IEndedSessionsReader>(),
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

function wipeTables() {
  const chain = {
    update: () => chain,
    set: () => chain,
    delete: () => chain,
    where: () => chain,
    returning: async () => [{ id: "u1" }],
  };

  return chain;
}

function wipeRepository(deps: {
  logger: PortMock<ILogger>;
  apiTokens: PortMock<IApiTokenRevoker>;
  staffData: PortMock<IStaffDataEraser>;
}) {
  return new DrizzleRgpdRepository(
    deps.logger,
    mockInstrumentation(),
    deps.apiTokens,
    deps.staffData,
    mockPort<IEndedSessionsReader>(),
  );
}

describe("DrizzleRgpdRepository.executeWipe", () => {
  const portFailure: AppError = { code: "ADMIN_STAFF_PROVIDER_FAILURE", message: "boom" };

  it("given the staff data eraser fails, then the wipe fails and logs the cause", async () => {
    const logger = mockPort<ILogger>();
    const staffData = mockPort<IStaffDataEraser>();
    staffData.eraseDataOf.mockImplementation(async () => Result.fail(portFailure));

    const result = await UnitOfWorkContext.run(wipeTables(), () =>
      wipeRepository({ logger, apiTokens: mockPort<IApiTokenRevoker>(), staffData }).executeWipe(
        "u1",
      ),
    );

    expect(result.getError().code).toBe("RGPD_REPOSITORY_PROVIDER_FAILURE");
    expect(logger.error).toHaveBeenCalledWith(
      { err: portFailure, userId: "u1" },
      "RgpdRepository.executeWipe failed",
    );
  });

  it("given the token revoker fails, then the wipe fails and logs the cause", async () => {
    const logger = mockPort<ILogger>();
    const staffData = mockPort<IStaffDataEraser>();
    staffData.eraseDataOf.mockImplementation(async () => Result.ok());
    const apiTokens = mockPort<IApiTokenRevoker>();
    apiTokens.revokeAllOfUser.mockImplementation(async () => Result.fail(portFailure));

    const result = await UnitOfWorkContext.run(wipeTables(), () =>
      wipeRepository({ logger, apiTokens, staffData }).executeWipe("u1"),
    );

    expect(result.getError().code).toBe("RGPD_REPOSITORY_PROVIDER_FAILURE");
    expect(logger.error).toHaveBeenCalledWith(
      { err: portFailure, userId: "u1" },
      "RgpdRepository.executeWipe failed",
    );
  });
});

import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { UserExportPayload } from "../../../application/mappers/user-export.mapper";
import type {
  IDeletionStateRepository,
  UserDeletionState,
} from "../../../application/ports/repositories/deletion-state.port";
import type {
  IUserDataExportReader,
  UserDataRecords,
} from "../../../application/ports/repositories/user-data-export.port";
import type {
  IExportStorage,
  StorageError,
} from "../../../application/ports/services/export-storage.port";
import { RequestDataExportUseCase } from "../../../application/usecases/request-data-export/request-data-export.usecase";
import {
  EMAIL_DOWN,
  inTransaction,
  NOW,
  REPO_DOWN,
  recordingOutbox,
  sameUnit,
  USER_ID,
  userState,
} from "../fixtures";

const RATE_LIMIT_HOURS = 24;
const EXPIRES_AT = "2026-06-08T12:00:00.000Z";
const DOWNLOAD_URL = "https://cdn.example.com/export.json";
const STORAGE_DOWN: StorageError = { code: "STORAGE_PROVIDER_FAILURE", message: "boom" };

const records: UserDataRecords = {
  user: {
    id: USER_ID,
    name: "User",
    email: "u@example.com",
    emailVerified: true,
    image: null,
    createdAt: NOW,
    updatedAt: NOW,
    twoFactorEnabled: false,
  },
  sessions: [
    {
      id: "s1",
      createdAt: NOW,
      expiresAt: NOW,
      ipAddress: "203.0.113.1",
      country: "FR",
      userAgent: null,
    },
  ],
  memberships: [],
  invitationsSent: [],
};

function isExportPayload(value: unknown): value is UserExportPayload {
  return typeof value === "object" && value !== null && "sessions" in value && "user" in value;
}

function given(state: UserDeletionState = userState()) {
  const seen: unknown[] = [];
  const states = mockPort<IDeletionStateRepository>();
  const exports = mockPort<IUserDataExportReader>();
  const storage = mockPort<IExportStorage>();
  const email = mockPort<IEmailService>();
  const outbox = recordingOutbox(seen);
  const uow = mockUnitOfWork();
  const logger = mockPort<ILogger>();

  states.findByUser.mockResolvedValue(Result.ok(Option.some(state)));
  states.touchExportRequestedAt.mockImplementation(inTransaction(seen, Result.ok()));
  exports.collect.mockResolvedValue(Result.ok(records));
  storage.uploadObject.mockResolvedValue(Result.ok());
  storage.presignDownload.mockResolvedValue(
    Result.ok({ url: DOWNLOAD_URL, expiresAt: EXPIRES_AT }),
  );
  email.sendTemplate.mockResolvedValue(Result.ok());

  const useCase = new RequestDataExportUseCase({
    states,
    exports,
    storage,
    email,
    transactions: uow.unitOfWork,
    outbox,
    settings: { exportRateLimitHours: RATE_LIMIT_HOURS },
    logger,
  });

  return { seen, states, exports, storage, email, outbox, uow, logger, useCase };
}

function uploadedKey(world: ReturnType<typeof given>): string {
  return world.storage.uploadObject.mock.calls[0]?.[0].key ?? "";
}

describe("request an export of the user data", () => {
  beforeEach(() => setSystemTime(NOW));

  afterEach(() => setSystemTime());

  it("refuses an unknown user as not found", async () => {
    const world = given();
    world.states.findByUser.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError().code).toBe("ACCOUNT_DELETION_NOT_FOUND");
  });

  it("refuses a second export inside the rate limit window and uploads nothing", async () => {
    const lastExport = new Date(NOW.getTime() - 60 * 60 * 1000);
    const world = given(userState({}, { lastExportRequestedAt: Option.some(lastExport) }));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError().code).toBe("ACCOUNT_EXPORT_RATE_LIMITED");
    expect(world.storage.uploadObject).not.toHaveBeenCalled();
  });

  it("propagates a failure to collect the user data", async () => {
    const world = given();
    world.exports.collect.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError()).toEqual(REPO_DOWN);
  });

  it("uploads the JSON under the user exports prefix, every collected field included", async () => {
    const world = given();

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getValue()).toEqual({ ok: true, expiresAt: EXPIRES_AT });
    expect(uploadedKey(world)).toMatch(/^u1\/exports\/[0-9a-f-]+\.json$/);
    const body: unknown = JSON.parse(String(world.storage.uploadObject.mock.calls[0]?.[0].body));
    if (!isExportPayload(body)) throw new Error("the upload is not an export payload");
    expect(body.exportedAt).toBe(NOW.toISOString());
    expect(body.sessions[0]?.country).toBe("FR");
    expect(world.storage.presignDownload).toHaveBeenCalledWith({
      key: uploadedKey(world),
      expiresInSeconds: 7 * 24 * 60 * 60,
    });
  });

  it("records the request and announces both export events in one unit", async () => {
    const world = given();

    await world.useCase.execute({ userId: USER_ID });

    expect(world.states.touchExportRequestedAt).toHaveBeenCalledWith(USER_ID);
    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.USER_EXPORT_REQUESTED,
        aggregateId: USER_ID,
        payload: { userId: USER_ID },
      },
      {
        eventType: EventTypes.USER_EXPORT_COMPLETED,
        aggregateId: USER_ID,
        payload: {
          userId: USER_ID,
          storageKey: uploadedKey(world),
          expiresAt: new Date(EXPIRES_AT),
        },
      },
    ]);
    expect(world.seen).toHaveLength(3);
    expect(sameUnit(world.seen)).toBe(true);
  });

  it("emails the download link", async () => {
    const world = given();

    await world.useCase.execute({ userId: USER_ID });

    expect(world.email.sendTemplate).toHaveBeenCalledWith(
      "data_export_ready",
      "u@example.com",
      { name: "User", downloadUrl: DOWNLOAD_URL, expiresAt: EXPIRES_AT },
      { idempotencyKey: `data-export/${uploadedKey(world)}`, locale: "fr" },
    );
  });

  it("keeps the export when the email fails, only logging it", async () => {
    const world = given();
    world.email.sendTemplate.mockResolvedValue(Result.fail(EMAIL_DOWN));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.isSuccess).toBe(true);
    expect(world.uow.outcome()).toBe("committed");
    expect(world.logger.warn).toHaveBeenCalled();
  });

  it("fails without recording the request when the upload fails", async () => {
    const world = given();
    world.storage.uploadObject.mockResolvedValue(Result.fail(STORAGE_DOWN));

    const result = await world.useCase.execute({ userId: USER_ID });

    expect(result.getError()).toEqual(STORAGE_DOWN);
    expect(world.states.touchExportRequestedAt).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });
});

import { type ILogger, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { isExportAllowed } from "../../../domain/deletion/services/deletion-eligibility.service";
import type { RgpdSettings } from "../../config/rgpd-settings";
import { userExportCompletedEvent } from "../../events/user-export-completed.event";
import { userExportRequestedEvent } from "../../events/user-export-requested.event";
import { toUserExportPayload } from "../../mappers/user-export.mapper";
import type {
  IDeletionStateRepository,
  RgpdError,
} from "../../ports/repositories/deletion-state.port";
import type { IUserDataExportReader } from "../../ports/repositories/user-data-export.port";
import type { IExportStorage, StorageError } from "../../ports/services/export-storage.port";
import type { RequestDataExportInput, RequestDataExportOutput } from "./request-data-export.dto";

const EXPORT_DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface RequestDataExportCollaborators {
  states: IDeletionStateRepository;
  exports: IUserDataExportReader;
  storage: IExportStorage;
  email: IEmailService;
  transactions: IUnitOfWork;
  outbox: IOutboxRepository;
  settings: Pick<RgpdSettings, "exportRateLimitHours">;
  logger: ILogger;
}

export class RequestDataExportUseCase
  implements IUseCase<RequestDataExportInput, RequestDataExportOutput, RgpdError | StorageError>
{
  constructor(private readonly deps: RequestDataExportCollaborators) {}

  async execute(
    input: RequestDataExportInput,
  ): Promise<Result<RequestDataExportOutput, RgpdError | StorageError>> {
    const found = await this.deps.states.findByUser(input.userId);
    if (found.isFailure) return Result.fail(found.getError());
    if (found.getValue().isNone())
      return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

    const state = found.getValue().unwrap();
    const rateLimitHours = this.deps.settings.exportRateLimitHours;
    if (!isExportAllowed(state.lastExportRequestedAt, new Date(), rateLimitHours))
      return Result.fail({
        code: "ACCOUNT_EXPORT_RATE_LIMITED",
        message: `data export limited to once per ${rateLimitHours}h`,
      });

    const records = await this.deps.exports.collect(input.userId);
    if (records.isFailure) return Result.fail(records.getError());

    const key = `${input.userId}/exports/${crypto.randomUUID()}.json`;
    const upload = await this.deps.storage.uploadObject({
      key,
      body: JSON.stringify(toUserExportPayload(records.getValue(), new Date()), null, 2),
      contentType: "application/json",
    });
    if (upload.isFailure) return Result.fail(upload.getError());

    const presigned = await this.deps.storage.presignDownload({
      key,
      expiresInSeconds: EXPORT_DOWNLOAD_TTL_SECONDS,
    });
    if (presigned.isFailure) return Result.fail(presigned.getError());
    const { url, expiresAt } = presigned.getValue();

    const recorded = await this.deps.transactions.run(async () => {
      const touched = await this.deps.states.touchExportRequestedAt(input.userId);
      if (touched.isFailure) return touched;

      await emitBuiltEvent(this.deps.outbox, userExportRequestedEvent({ userId: input.userId }));
      await emitBuiltEvent(
        this.deps.outbox,
        userExportCompletedEvent({
          userId: input.userId,
          storageKey: key,
          expiresAt: new Date(expiresAt),
        }),
      );

      return Result.ok<RgpdError>();
    });
    if (recorded.isFailure) return Result.fail(recorded.getError());

    const sent = await this.deps.email.sendTemplate(
      "data_export_ready",
      state.email,
      { name: state.name, downloadUrl: url, expiresAt },
      { idempotencyKey: `data-export/${key}`, locale: state.locale.toUndefined() },
    );
    if (sent.isFailure)
      this.deps.logger.warn(
        { userId: input.userId, code: sent.getError().code },
        "data export upload succeeded but email failed",
      );

    return Result.ok({ ok: true, expiresAt });
  }
}

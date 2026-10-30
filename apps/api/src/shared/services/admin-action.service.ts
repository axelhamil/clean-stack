import { type AppError, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { setOrgSsoEnforced } from "../../auth-queries";
import { emitEvent } from "../event-emitter";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository } from "../ports/outbox.port";

export type AdminActionError = AppError<"ADMIN_ACTION_PROVIDER_FAILURE">;

type ActionResult = Promise<Result<void, AdminActionError>>;

export class AdminActionService {
  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async setSsoEnforcement(input: {
    organizationId: string;
    enforced: boolean;
    actorUserId: string;
    viaPlatformAdmin: boolean;
  }): ActionResult {
    return this.run("setSsoEnforcement", async () => {
      await this.uow.run(async () => {
        await setOrgSsoEnforced(input.organizationId, input.enforced);

        await emitEvent(
          this.outbox,
          EventTypes.SSO_ENFORCEMENT_CHANGED,
          "organization",
          input.organizationId,
          {
            actorUserId: input.actorUserId,
            organizationId: input.organizationId,
            enforced: input.enforced,
            viaPlatformAdmin: input.viaPlatformAdmin,
          },
          { organizationId: input.organizationId },
        );
      });
    });
  }

  private async run(method: string, body: () => Promise<void>): ActionResult {
    return this.instrumentation.startSpan({ name: `AdminActionService > ${method}` }, async () => {
      try {
        await body();
        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "ADMIN_ACTION_PROVIDER_FAILURE",
          message: `Failed to ${method}`,
        });
      }
    });
  }
}

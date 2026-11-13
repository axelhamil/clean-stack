import { type IInstrumentation, type ILogger, Option, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  eq,
  isNull,
  lte,
  resolveExecutor,
  schema,
} from "@packages/drizzle";
import { isLocale } from "@packages/i18n";
import type {
  IDeletionStateRepository,
  PendingDeletionRow,
  RgpdError,
  UserDeletionState,
} from "../../../application/ports/repositories/deletion-state.port";
import { DeletionState } from "../../../domain/deletion/value-objects/deletion-state.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("RGPD_REPOSITORY_PROVIDER_FAILURE");

export class DrizzleDeletionStateRepository implements IDeletionStateRepository {
  constructor(
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async findByUser(userId: string): Promise<Result<Option<UserDeletionState>, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleDeletionStateRepository > findByUser" },
      async () => {
        try {
          const query = exec
            .select({
              email: schema.user.email,
              name: schema.user.name,
              locale: schema.user.locale,
              twoFactorEnabled: schema.user.twoFactorEnabled,
              pendingDeletionUntil: schema.user.pendingDeletionUntil,
              deletedAt: schema.user.deletedAt,
              lastExportRequestedAt: schema.user.lastExportRequestedAt,
            })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1);
          const [u] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!u) return Result.ok(Option.none());

          const deletion = DeletionState.of(
            Option.fromNullable(u.pendingDeletionUntil),
            Option.fromNullable(u.deletedAt),
          );
          if (deletion.isFailure) {
            this.logger.error(
              { userId, cause: deletion.getError().message },
              "DeletionStateRepository.findByUser read an invalid deletion state",
            );
            return Result.fail(repositoryFailure("findByUser"));
          }

          return Result.ok(
            Option.some({
              email: u.email,
              name: u.name,
              locale: isLocale(u.locale) ? Option.some(u.locale) : Option.none(),
              twoFactorEnabled: u.twoFactorEnabled ?? false,
              deletion: deletion.getValue(),
              lastExportRequestedAt: Option.fromNullable(u.lastExportRequestedAt),
            }),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "DeletionStateRepository.findByUser failed");
          return Result.fail(repositoryFailure("findByUser"));
        }
      },
    );
  }

  async markPending(userId: string, until: Date): Promise<Result<void, RgpdError>> {
    return this.updateUser("markPending", userId, { pendingDeletionUntil: until });
  }

  async clearPending(userId: string): Promise<Result<void, RgpdError>> {
    return this.updateUser("clearPending", userId, { pendingDeletionUntil: null });
  }

  async touchExportRequestedAt(userId: string): Promise<Result<void, RgpdError>> {
    return this.updateUser("touchExportRequestedAt", userId, { lastExportRequestedAt: new Date() });
  }

  async findReadyForWipe(limit: number): Promise<Result<PendingDeletionRow[], RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleDeletionStateRepository > findReadyForWipe" },
      async () => {
        try {
          const query = exec
            .select({
              userId: schema.user.id,
              email: schema.user.email,
              pendingDeletionUntil: schema.user.pendingDeletionUntil,
            })
            .from(schema.user)
            .where(
              and(lte(schema.user.pendingDeletionUntil, new Date()), isNull(schema.user.deletedAt)),
            )
            .limit(limit);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            rows.flatMap(({ pendingDeletionUntil, ...row }): PendingDeletionRow[] =>
              pendingDeletionUntil ? [{ ...row, pendingDeletionUntil }] : [],
            ),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, limit }, "DeletionStateRepository.findReadyForWipe failed");
          return Result.fail(repositoryFailure("findReadyForWipe"));
        }
      },
    );
  }

  private async updateUser(
    method: string,
    userId: string,
    values: { pendingDeletionUntil?: Date | null; lastExportRequestedAt?: Date },
  ): Promise<Result<void, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleDeletionStateRepository > ${method}` },
      async () => {
        try {
          const query = exec.update(schema.user).set(values).where(eq(schema.user.id, userId));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, `DeletionStateRepository.${method} failed`);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }
}

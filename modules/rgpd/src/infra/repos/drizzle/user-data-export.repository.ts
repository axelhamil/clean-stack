import { type IInstrumentation, type ILogger, Result } from "@packages/ddd-kit";
import { dbOperationFailure, eq, resolveExecutor, schema } from "@packages/drizzle";
import type { RgpdError } from "../../../application/ports/repositories/deletion-state.port";
import type {
  IUserDataExportReader,
  UserDataRecords,
} from "../../../application/ports/repositories/user-data-export.port";

const repositoryFailure = dbOperationFailure("RGPD_REPOSITORY_PROVIDER_FAILURE");

export class DrizzleUserDataExportReader implements IUserDataExportReader {
  constructor(
    private readonly logger: ILogger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async collect(userId: string): Promise<Result<UserDataRecords, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleUserDataExportReader > collect" },
      async () => {
        try {
          const [user] = await exec
            .select({
              id: schema.user.id,
              name: schema.user.name,
              email: schema.user.email,
              emailVerified: schema.user.emailVerified,
              image: schema.user.image,
              createdAt: schema.user.createdAt,
              updatedAt: schema.user.updatedAt,
              twoFactorEnabled: schema.user.twoFactorEnabled,
            })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1)
            .execute();
          if (!user)
            return Result.fail({ code: "ACCOUNT_DELETION_NOT_FOUND", message: "user not found" });

          const sessions = await exec
            .select({
              id: schema.session.id,
              createdAt: schema.session.createdAt,
              expiresAt: schema.session.expiresAt,
              ipAddress: schema.session.ipAddress,
              country: schema.session.country,
              userAgent: schema.session.userAgent,
            })
            .from(schema.session)
            .where(eq(schema.session.userId, userId))
            .execute();

          const memberships = await exec
            .select({
              organizationId: schema.organization.id,
              organizationName: schema.organization.name,
              organizationSlug: schema.organization.slug,
              role: schema.member.role,
              joinedAt: schema.member.createdAt,
            })
            .from(schema.member)
            .innerJoin(
              schema.organization,
              eq(schema.member.organizationId, schema.organization.id),
            )
            .where(eq(schema.member.userId, userId))
            .execute();

          const invitationsSent = await exec
            .select({
              id: schema.invitation.id,
              organizationId: schema.invitation.organizationId,
              email: schema.invitation.email,
              role: schema.invitation.role,
              status: schema.invitation.status,
              createdAt: schema.invitation.createdAt,
            })
            .from(schema.invitation)
            .where(eq(schema.invitation.inviterId, userId))
            .execute();

          return Result.ok({ user, sessions, memberships, invitationsSent });
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "UserDataExportReader.collect failed");
          return Result.fail(repositoryFailure("collect"));
        }
      },
    );
  }
}

import { isStaffPermission, isStaffRole, type StaffRole } from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
import { and, asc, authSchema, eq, isNull, resolveExecutor, staffSchema } from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  IStaffStore,
  StaffListRow,
  StaffManagerRecord,
  StaffOverrideRecord,
  StaffRecord,
  StaffSource,
  StaffStoreError,
} from "../../../../shared/ports/staff-store.port";

const fail = createDbFailure("ADMIN_STAFF_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;
const MIRROR_STAFF = "admin";
const MIRROR_PLAIN = "user";

function sourceOf(value: string): StaffSource {
  if (value === "env" || value === "migration") return value;

  return "console";
}

function overrideOf(row: {
  permission: string;
  effect: string;
  expiresAt: Date | null;
}): Option<StaffOverrideRecord> {
  if (!isStaffPermission(row.permission)) return Option.none();

  return Option.some({
    permission: row.permission,
    effect: row.effect === "deny" ? "deny" : "grant",
    expiresAt: Option.fromNullable(row.expiresAt),
  });
}

export class DrizzleStaffStore implements IStaffStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findActive(userId: string): Promise<Result<Option<StaffRecord>, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStaffStore > findActive" }, async () => {
      try {
        const { staffMember, staffPermissionOverride } = staffSchema;
        const [row] = await exec
          .select({ role: staffMember.role, source: staffMember.source })
          .from(staffMember)
          .where(and(eq(staffMember.userId, userId), isNull(staffMember.revokedAt)))
          .limit(1);

        if (!row || !isStaffRole(row.role)) return Result.ok(Option.none());

        const overrides = await exec
          .select({
            permission: staffPermissionOverride.permission,
            effect: staffPermissionOverride.effect,
            expiresAt: staffPermissionOverride.expiresAt,
          })
          .from(staffPermissionOverride)
          .where(
            and(
              eq(staffPermissionOverride.userId, userId),
              isNull(staffPermissionOverride.revokedAt),
            ),
          );

        return Result.ok(
          Option.some({
            userId,
            role: row.role,
            source: sourceOf(row.source),
            overrides: overrides.flatMap((o) => {
              const parsed = overrideOf(o);

              return parsed.isSome() ? [parsed.unwrap()] : [];
            }),
          }),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "staff lookup failed");
      }
    });
  }

  async listActive(): Promise<Result<StaffListRow[], StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStaffStore > listActive" }, async () => {
      try {
        const { staffMember } = staffSchema;
        const { user } = authSchema;
        const query = exec
          .select({
            userId: staffMember.userId,
            email: user.email,
            name: user.name,
            role: staffMember.role,
            source: staffMember.source,
            createdAt: staffMember.createdAt,
          })
          .from(staffMember)
          .innerJoin(user, eq(user.id, staffMember.userId))
          .where(isNull(staffMember.revokedAt))
          .orderBy(asc(staffMember.createdAt));

        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(
          rows.flatMap((row) => {
            const { role } = row;
            if (!isStaffRole(role)) return [];

            return [{ ...row, role, source: sourceOf(row.source) }];
          }),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "staff list failed");
      }
    });
  }

  async lockActiveManagers(): Promise<Result<StaffManagerRecord[], StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffStore > lockActiveManagers" },
      async () => {
        try {
          const { staffMember } = staffSchema;
          const manager: StaffRole = "manager";
          const query = exec
            .select({ userId: staffMember.userId, source: staffMember.source })
            .from(staffMember)
            .where(and(eq(staffMember.role, manager), isNull(staffMember.revokedAt)))
            .orderBy(asc(staffMember.userId))
            .for("update");

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.map((row) => ({ ...row, source: sourceOf(row.source) })));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "staff manager lock failed");
        }
      },
    );
  }

  async insertFromEnv(userId: string): Promise<Result<boolean, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffStore > insertFromEnv" },
      async () => {
        try {
          const { staffMember } = staffSchema;
          const inserted = await exec
            .insert(staffMember)
            .values({ userId, role: "manager", source: "env" })
            .onConflictDoNothing()
            .returning({ userId: staffMember.userId });

          if (inserted.length === 0) return Result.ok(false);

          await exec
            .update(authSchema.user)
            .set({ role: MIRROR_STAFF })
            .where(eq(authSchema.user.id, userId));

          return Result.ok(true);
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "staff bootstrap failed");
        }
      },
    );
  }

  async assign(input: {
    userId: string;
    role: StaffRole;
    createdBy: string;
  }): Promise<Result<void, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStaffStore > assign" }, async () => {
      try {
        const now = new Date();

        await exec
          .insert(staffSchema.staffMember)
          .values({ ...input, source: "console" })
          .onConflictDoUpdate({
            target: staffSchema.staffMember.userId,
            set: { role: input.role, source: "console", updatedAt: now, revokedAt: null },
          });

        await exec
          .update(authSchema.user)
          .set({ role: MIRROR_STAFF })
          .where(eq(authSchema.user.id, input.userId));

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "staff assignment failed");
      }
    });
  }

  async revoke(userId: string): Promise<Result<void, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStaffStore > revoke" }, async () => {
      try {
        const { staffMember, staffPermissionOverride } = staffSchema;
        const now = new Date();

        await exec
          .update(staffMember)
          .set({ revokedAt: now, updatedAt: now })
          .where(eq(staffMember.userId, userId));

        await exec
          .update(staffPermissionOverride)
          .set({ revokedAt: now })
          .where(
            and(
              eq(staffPermissionOverride.userId, userId),
              isNull(staffPermissionOverride.revokedAt),
            ),
          );

        await exec
          .update(authSchema.user)
          .set({ role: MIRROR_PLAIN })
          .where(eq(authSchema.user.id, userId));

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "staff revocation failed");
      }
    });
  }
}

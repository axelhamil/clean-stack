import {
  isStaffPermission,
  isStaffRole,
  type StaffPermission,
  type StaffRole,
} from "@packages/access-control";
import { Option, Result } from "@packages/ddd-kit";
import {
  and,
  asc,
  authSchema,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  resolveExecutor,
  staffSchema,
} from "@packages/drizzle";
import { createDbFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  IStaffStore,
  StaffListRow,
  StaffManagerRecord,
  StaffOverrideRecord,
  StaffOverrideRow,
  StaffRecord,
  StaffSource,
  StaffStoreError,
} from "../../../../shared/ports/staff-store.port";

type Executor = ReturnType<typeof resolveExecutor>;

const fail = createDbFailure("ADMIN_STAFF_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;
const MIRROR_STAFF = "admin";
const MIRROR_PLAIN = "user";
const MANAGE_STAFF: StaffPermission = "staff.manage";

export function sourceOf(value: string): Option<StaffSource> {
  if (value === "env" || value === "console" || value === "migration") return Option.some(value);

  return Option.none();
}

export function overrideOf(row: {
  permission: string;
  effect: string;
  expiresAt: Date | null;
}): Option<StaffOverrideRecord> {
  if (!isStaffPermission(row.permission)) return Option.none();

  return Option.some({
    permission: row.permission,
    effect: row.effect === "grant" ? "grant" : "deny",
    expiresAt: Option.fromNullable(row.expiresAt),
  });
}

function banIsLive(banned: boolean | null, banExpires: Date | null, now: Date): boolean {
  if (banned !== true) return false;

  return banExpires === null || banExpires > now;
}

async function deleteImpersonationSessions(exec: Executor, userId: string): Promise<void> {
  await exec.delete(authSchema.session).where(eq(authSchema.session.impersonatedBy, userId));
}

function stillCountsAsManager(
  owner: {
    banned: boolean | null;
    banExpires: Date | null;
    deletedAt: Date | null;
    pendingDeletionUntil: Date | null;
  },
  now: Date,
): boolean {
  if (owner.deletedAt || owner.pendingDeletionUntil) return false;

  return !banIsLive(owner.banned, owner.banExpires, now);
}

export class DrizzleStaffStore implements IStaffStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findActive(userId: string): Promise<Result<Option<StaffRecord>, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStaffStore > findActive" }, async () => {
      try {
        const { staffMember, staffPermissionOverride } = staffSchema;
        const query = exec
          .select({
            role: staffMember.role,
            source: staffMember.source,
            banned: authSchema.user.banned,
            banExpires: authSchema.user.banExpires,
            permission: staffPermissionOverride.permission,
            effect: staffPermissionOverride.effect,
            expiresAt: staffPermissionOverride.expiresAt,
          })
          .from(staffMember)
          .innerJoin(authSchema.user, eq(authSchema.user.id, staffMember.userId))
          .leftJoin(
            staffPermissionOverride,
            and(
              eq(staffPermissionOverride.userId, staffMember.userId),
              isNull(staffPermissionOverride.revokedAt),
            ),
          )
          .where(and(eq(staffMember.userId, userId), isNull(staffMember.revokedAt)));

        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        const [first] = rows;
        if (!first || !isStaffRole(first.role)) return Result.ok(Option.none());

        const { role } = first;

        return Result.ok(
          sourceOf(first.source).map((source) => ({
            userId,
            role,
            source,
            banned: banIsLive(first.banned, first.banExpires, new Date()),
            overrides: rows.flatMap(({ permission, effect, expiresAt }) => {
              if (permission === null || effect === null) return [];

              const parsed = overrideOf({ permission, effect, expiresAt });

              return parsed.isSome() ? [parsed.unwrap()] : [];
            }),
          })),
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
            const source = sourceOf(row.source);
            if (!isStaffRole(role) || source.isNone()) return [];

            return [{ ...row, role, source: source.unwrap() }];
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
          const { user } = authSchema;
          const manager: StaffRole = "manager";
          const locked = await exec
            .select({ userId: staffMember.userId, source: staffMember.source })
            .from(staffMember)
            .where(and(eq(staffMember.role, manager), isNull(staffMember.revokedAt)))
            .orderBy(asc(staffMember.userId))
            .for("update");

          if (locked.length === 0) return Result.ok([]);

          const now = new Date();
          const { staffPermissionOverride: override } = staffSchema;
          const lockedIds = locked.map((row) => row.userId);
          const deniedRows = await exec
            .select({ userId: override.userId })
            .from(override)
            .where(
              and(
                inArray(override.userId, lockedIds),
                eq(override.permission, MANAGE_STAFF),
                eq(override.effect, "deny"),
                isNull(override.revokedAt),
                or(isNull(override.expiresAt), gt(override.expiresAt, now)),
              ),
            );
          const denied = new Set(deniedRows.map((row) => row.userId));

          const owners = await exec
            .select({
              id: user.id,
              banned: user.banned,
              banExpires: user.banExpires,
              deletedAt: user.deletedAt,
              pendingDeletionUntil: user.pendingDeletionUntil,
            })
            .from(user)
            .where(inArray(user.id, lockedIds));

          const counted = new Set(
            owners.filter((owner) => stillCountsAsManager(owner, now)).map((owner) => owner.id),
          );

          return Result.ok(
            locked.flatMap(({ userId, source }) => {
              const parsed = sourceOf(source);
              if (!counted.has(userId) || parsed.isNone()) return [];

              return [{ userId, source: parsed.unwrap(), manageDenied: denied.has(userId) }];
            }),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "staff manager lock failed");
        }
      },
    );
  }

  async bootstrapFromEnv(userId: string): Promise<Result<boolean, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffStore > bootstrapFromEnv" },
      async () => {
        try {
          const { staffMember } = staffSchema;
          const written = await exec
            .insert(staffMember)
            .values({ userId, role: "manager", source: "env" })
            .onConflictDoUpdate({
              target: staffMember.userId,
              set: { role: "manager", source: "env", revokedAt: null, updatedAt: new Date() },
              where: isNotNull(staffMember.revokedAt),
            })
            .returning({ userId: staffMember.userId });

          if (written.length === 0) return Result.ok(false);

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
            set: {
              role: input.role,
              source: "console",
              createdBy: input.createdBy,
              updatedAt: now,
              revokedAt: null,
            },
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

        await deleteImpersonationSessions(exec, userId);

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "staff revocation failed");
      }
    });
  }

  async endImpersonationsBy(userId: string): Promise<Result<void, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffStore > endImpersonationsBy" },
      async () => {
        try {
          await deleteImpersonationSessions(exec, userId);

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "impersonation end failed");
        }
      },
    );
  }

  async listLiveOverrides(userId: string): Promise<Result<StaffOverrideRow[], StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffStore > listLiveOverrides" },
      async () => {
        try {
          const { staffPermissionOverride: override } = staffSchema;
          const query = exec
            .select({
              id: override.id,
              permission: override.permission,
              effect: override.effect,
              expiresAt: override.expiresAt,
              createdAt: override.createdAt,
            })
            .from(override)
            .where(
              and(
                eq(override.userId, userId),
                isNull(override.revokedAt),
                or(isNull(override.expiresAt), gt(override.expiresAt, new Date())),
              ),
            )
            .orderBy(asc(override.createdAt));

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            rows.flatMap((row) => {
              const parsed = overrideOf(row);

              return parsed.isSome()
                ? [{ ...parsed.unwrap(), id: row.id, createdAt: row.createdAt }]
                : [];
            }),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "staff override list failed");
        }
      },
    );
  }

  async replaceOverride(input: {
    userId: string;
    permission: StaffPermission;
    effect: "grant" | "deny";
    expiresAt: Option<Date>;
    createdBy: string;
  }): Promise<Result<string, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffStore > replaceOverride" },
      async () => {
        try {
          const { staffPermissionOverride: override } = staffSchema;
          const id = crypto.randomUUID();

          await exec
            .update(override)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(override.userId, input.userId),
                eq(override.permission, input.permission),
                isNull(override.revokedAt),
              ),
            );

          await exec.insert(override).values({
            id,
            userId: input.userId,
            permission: input.permission,
            effect: input.effect,
            expiresAt: input.expiresAt.toNull(),
            createdBy: input.createdBy,
          });

          return Result.ok(id);
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "staff override write failed");
        }
      },
    );
  }

  async revokeOverride(
    userId: string,
    overrideId: string,
  ): Promise<Result<Option<StaffOverrideRecord>, StaffStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffStore > revokeOverride" },
      async () => {
        try {
          const { staffPermissionOverride: override } = staffSchema;
          const [row] = await exec
            .update(override)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(override.id, overrideId),
                eq(override.userId, userId),
                isNull(override.revokedAt),
              ),
            )
            .returning({
              permission: override.permission,
              effect: override.effect,
              expiresAt: override.expiresAt,
            });

          return Result.ok(row ? overrideOf(row) : Option.none());
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "staff override revocation failed");
        }
      },
    );
  }
}

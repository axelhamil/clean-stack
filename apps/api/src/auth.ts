import "@simplewebauthn/server";
import "zod/v4/core";
import { passkey } from "@better-auth/passkey";
import { ac, isPersonalOrg, roles } from "@packages/access-control";
import { and, db, desc, eq, schema, sql, type Transaction } from "@packages/drizzle";
import { type EventType, EventTypes } from "@packages/events";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer, customSession, magicLink, organization, twoFactor } from "better-auth/plugins";
import { CryptoHasher } from "bun";
import { di } from "./container";
import { env } from "./shared/env";
import { emitEvent } from "./shared/event-emitter";
import { logger } from "./shared/logger";
import type { EmailTemplates, TemplateVariables } from "./shared/ports/email.port";

const isProd = env.NODE_ENV === "production";

function tokenIdempotencyKey(template: string, token: string): string {
  const hash = new CryptoHasher("sha256").update(token).digest("hex").slice(0, 32);
  return `${template}/${hash}`;
}

interface SignupUser {
  email: string;
  name: string;
}

async function ensurePersonalOrgFor(userId: string, signupUser?: SignupUser): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

    const [existing] = await tx
      .select({ id: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, userId))
      .limit(1);
    if (existing) {
      if (signupUser)
        await emit(
          EventTypes.USER_CREATED,
          "user",
          userId,
          { userId, email: signupUser.email, name: signupUser.name },
          null,
          tx,
        );
      return existing.id;
    }

    const orgId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const slug = `personal-${orgId}`;
    const now = new Date();
    await tx.insert(schema.organization).values({
      id: orgId,
      name: "Personal",
      slug,
      createdAt: now,
    });
    await tx.insert(schema.member).values({
      id: memberId,
      organizationId: orgId,
      userId,
      role: "owner",
      createdAt: now,
    });
    await emit(
      EventTypes.ORG_CREATED,
      "organization",
      orgId,
      { organizationId: orgId, ownerUserId: userId, slug, name: "Personal" },
      orgId,
      tx,
    );
    await emit(
      EventTypes.ORG_MEMBER_JOINED,
      "member",
      memberId,
      { organizationId: orgId, userId, role: "owner" },
      orgId,
      tx,
    );
    if (signupUser)
      await emit(
        EventTypes.USER_CREATED,
        "user",
        userId,
        { userId, email: signupUser.email, name: signupUser.name },
        null,
        tx,
      );
    return orgId;
  });
}

async function emit<TPayload>(
  eventType: EventType,
  aggregateType: string,
  aggregateId: string,
  payload: TPayload,
  organizationId?: string | null,
  tx?: Transaction,
): Promise<void> {
  await emitEvent(
    di.IOutboxRepository,
    eventType,
    aggregateType,
    aggregateId,
    payload,
    { organizationId },
    tx,
  );
}

async function dispatchEmail<K extends keyof EmailTemplates>(
  template: K,
  to: string,
  variables: EmailTemplates[K] & TemplateVariables,
  idempotencyKey: string,
): Promise<void> {
  const result = await di.IEmailService.sendTemplate(template, to, variables, {
    idempotencyKey,
  });
  if (result.isFailure) {
    const error = result.getError();
    if (error.code === "EMAIL_PROVIDER_FAILURE") {
      // BetterAuth hook signature is `async () => void` — no Result propagation possible; throw is the only signal.
      throw new Error(`email send failed (${template}): ${error.message}`);
    }
    logger.warn({ template, to, code: error.code }, "email skipped — transport not configured");
  }
}

const authOptions = {
  appName: "clean-stack",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, { provider: "pg" }),

  user: {
    additionalFields: {
      pendingDeletionUntil: { type: "date", required: false, returned: true, input: false },
      lastExportRequestedAt: { type: "date", required: false, returned: true, input: false },
      deletedAt: { type: "date", required: false, returned: false, input: false },
    },
  },

  trustedOrigins: env.CORS_ORIGIN,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      await emit(EventTypes.USER_PASSWORD_RESET_REQUESTED, "user", user.id, {
        userId: user.id,
        email: user.email,
      });
      await dispatchEmail(
        "reset_password",
        user.email,
        { name: user.name ?? "", resetUrl },
        tokenIdempotencyKey("reset-password", token),
      );
    },
    onPasswordReset: async ({ user }) => {
      await emit(EventTypes.USER_PASSWORD_CHANGED, "user", user.id, { userId: user.id });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verifyUrl = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      await dispatchEmail(
        "verify_email",
        user.email,
        { name: user.name ?? "", verifyUrl },
        tokenIdempotencyKey("verify-email", token),
      );
    },
  },

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
    },
  },

  plugins: [
    bearer(),
    twoFactor(),
    magicLink({
      sendMagicLink: async ({ email, token }) => {
        const magicUrl = `${env.APP_URL}/magic-link?token=${encodeURIComponent(token)}`;
        await emit(EventTypes.USER_MAGIC_LINK_REQUESTED, "user", email, { email });
        await dispatchEmail(
          "magic_link",
          email,
          { magicUrl },
          tokenIdempotencyKey("magic-link", token),
        );
      },
    }),
    passkey({ rpName: "clean-stack" }),
    organization({
      ac,
      roles,
      creatorRole: "owner",
      organizationHooks: {
        beforeDeleteOrganization: async ({ organization: org }) => {
          if (isPersonalOrg(org.slug)) {
            throw new Error(
              "Personal organization cannot be deleted. Delete your account instead.",
            );
          }
        },
        afterCreateOrganization: async ({ organization: org, member }) => {
          if (isPersonalOrg(org.slug)) return;
          await emit(
            EventTypes.ORG_CREATED,
            "organization",
            org.id,
            {
              organizationId: org.id,
              ownerUserId: member.userId,
              slug: org.slug,
              name: org.name,
            },
            org.id,
          );
        },
        afterUpdateOrganization: async ({ organization: org, user }) => {
          if (!org) return;
          await emit(
            EventTypes.ORG_UPDATED,
            "organization",
            org.id,
            {
              organizationId: org.id,
              actorUserId: user.id,
              changes: { name: org.name, slug: org.slug, logo: org.logo },
            },
            org.id,
          );
        },
        afterDeleteOrganization: async ({ organization: org, user }) => {
          if (isPersonalOrg(org.slug)) return;
          await emit(
            EventTypes.ORG_DELETED,
            "organization",
            org.id,
            { organizationId: org.id, actorUserId: user.id },
            org.id,
          );
        },
        afterAddMember: async ({ member, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_JOINED,
            "member",
            member.id,
            {
              organizationId: org.id,
              userId: member.userId,
              role: member.role,
            },
            org.id,
          );
        },
        afterRemoveMember: async ({ member, user, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_REMOVED,
            "member",
            member.id,
            { organizationId: org.id, actorUserId: user.id, userId: member.userId },
            org.id,
          );
          if (isPersonalOrg(org.slug)) return;
          await db.transaction(async (tx) => {
            const deleted = await tx
              .delete(schema.organization)
              .where(
                and(
                  eq(schema.organization.id, org.id),
                  eq(tx.$count(schema.member, eq(schema.member.organizationId, org.id)), 0),
                ),
              )
              .returning({ id: schema.organization.id });
            if (deleted.length === 0) return;
            await emit(
              EventTypes.ORG_DELETED,
              "organization",
              org.id,
              { organizationId: org.id, actorUserId: user.id },
              org.id,
              tx,
            );
          });
        },
        afterUpdateMemberRole: async ({ member, previousRole, user, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_ROLE_CHANGED,
            "member",
            member.id,
            {
              organizationId: org.id,
              actorUserId: user.id,
              userId: member.userId,
              previousRole,
              newRole: member.role,
            },
            org.id,
          );
        },
        afterCreateInvitation: async ({ invitation, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_INVITED,
            "invitation",
            invitation.id,
            {
              organizationId: org.id,
              invitationId: invitation.id,
              email: invitation.email,
              role: invitation.role ?? "member",
              inviterUserId: invitation.inviterId,
            },
            org.id,
          );
        },
        afterCancelInvitation: async ({ invitation, cancelledBy, organization: org }) => {
          await emit(
            EventTypes.ORG_INVITATION_CANCELLED,
            "invitation",
            invitation.id,
            {
              organizationId: org.id,
              actorUserId: cancelledBy.id,
              invitationId: invitation.id,
            },
            org.id,
          );
        },
        // `afterAddMember` only fires for direct adds (org-create creator, signup auto-personal-org).
        // BetterAuth routes invitation acceptance through `afterAcceptInvitation` — without this,
        // every member who joins via invite would be invisible to the outbox.
        afterAcceptInvitation: async ({ member, organization: org }) => {
          await emit(
            EventTypes.ORG_MEMBER_JOINED,
            "member",
            member.id,
            {
              organizationId: org.id,
              userId: member.userId,
              role: member.role,
            },
            org.id,
          );
        },
      },
      sendInvitationEmail: async ({ id, email, role, inviter, organization: org }) => {
        const inviteUrl = `${env.APP_URL}/accept-invitation/${id}`;
        await dispatchEmail(
          "org_invitation",
          email,
          {
            inviterName: inviter.user.name ?? inviter.user.email,
            orgName: org.name,
            role,
            inviteUrl,
          },
          tokenIdempotencyKey("org-invitation", id),
        );
      },
    }),
  ],

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.context.returned instanceof APIError) return;
      const path = ctx.path;
      const userId = ctx.context.session?.user.id;
      if (!userId) return;

      if (path === "/two-factor/enable") {
        await emit(EventTypes.USER_MFA_ENABLED, "user", userId, { userId });
        return;
      }
      if (path === "/two-factor/disable") {
        await emit(EventTypes.USER_MFA_DISABLED, "user", userId, { userId });
        return;
      }
      if (path === "/passkey/verify-registration") {
        const [latest] = await db
          .select({ id: schema.passkey.id, deviceType: schema.passkey.deviceType })
          .from(schema.passkey)
          .where(eq(schema.passkey.userId, userId))
          .orderBy(desc(schema.passkey.createdAt))
          .limit(1);
        if (latest) {
          await emit(EventTypes.USER_PASSKEY_ADDED, "user", userId, {
            userId,
            passkeyId: latest.id,
            deviceType: latest.deviceType ?? undefined,
          });
        }
        return;
      }
      if (path === "/passkey/delete-passkey") {
        const body = ctx.body as Record<string, unknown> | undefined;
        const passkeyId = body?.id;
        if (typeof passkeyId === "string") {
          await emit(EventTypes.USER_PASSKEY_REMOVED, "user", userId, { userId, passkeyId });
        }
        return;
      }
      if (path === "/verify-email") {
        const email = ctx.context.session?.user.email;
        if (email) {
          await emit(EventTypes.USER_EMAIL_VERIFIED, "user", userId, { userId, email });
        }
        return;
      }
      if (path === "/change-password") {
        await emit(EventTypes.USER_PASSWORD_CHANGED, "user", userId, { userId });
        return;
      }
      if (path === "/link-social") {
        const [latest] = await db
          .select({
            id: schema.account.id,
            providerId: schema.account.providerId,
            accountId: schema.account.accountId,
            createdAt: schema.account.createdAt,
          })
          .from(schema.account)
          .where(eq(schema.account.userId, userId))
          .orderBy(desc(schema.account.createdAt))
          .limit(1);
        const recentEnough = latest?.createdAt && Date.now() - latest.createdAt.getTime() < 5_000;
        if (latest && latest.providerId !== "credential" && recentEnough) {
          await emit(EventTypes.USER_ACCOUNT_LINKED, "account", latest.id, {
            userId,
            providerId: latest.providerId,
            accountId: latest.accountId,
          });
        }
        return;
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await ensurePersonalOrgFor(user.id, { email: user.email, name: user.name });
          } catch (err) {
            logger.error({ err, userId: user.id }, "personal-org creation failed at signup");
            throw err;
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          if (session.activeOrganizationId) return { data: session };
          try {
            const orgId = await ensurePersonalOrgFor(session.userId);
            return { data: { ...session, activeOrganizationId: orgId } };
          } catch (err) {
            logger.error(
              { err, userId: session.userId },
              "personal-org self-heal failed at sign-in",
            );
            throw err;
          }
        },
        after: async (session) => {
          await emit(EventTypes.USER_SIGNED_IN, "session", session.id, {
            userId: session.userId,
            sessionId: session.id,
            ipAddress: session.ipAddress ?? undefined,
            userAgent: session.userAgent ?? undefined,
          });
        },
      },
      delete: {
        after: async (session) => {
          await emit(EventTypes.USER_SIGNED_OUT, "session", session.id, {
            userId: session.userId,
            sessionId: session.id,
          });
        },
      },
    },
    account: {
      delete: {
        after: async (account) => {
          if (account.providerId === "credential") return;
          await emit(EventTypes.USER_ACCOUNT_UNLINKED, "account", account.id, {
            userId: account.userId,
            providerId: account.providerId,
            accountId: account.accountId,
          });
        },
      },
    },
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...authOptions,
  plugins: [
    ...authOptions.plugins,
    customSession(async ({ user, session }) => {
      if (!session.activeOrganizationId) return { user, session };
      const [row] = await db
        .select({ role: schema.member.role })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.organizationId, session.activeOrganizationId),
            eq(schema.member.userId, user.id),
          ),
        )
        .limit(1);
      return {
        user,
        session: { ...session, activeOrganizationRole: row?.role ?? null },
      };
    }, authOptions),
  ],
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;

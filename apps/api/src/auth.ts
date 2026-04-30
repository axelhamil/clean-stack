import "@simplewebauthn/server";
import "zod/v4/core";
import { passkey } from "@better-auth/passkey";
import { ac, roles } from "@packages/access-control";
import { db, eq, schema } from "@packages/drizzle";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, magicLink, organization, twoFactor } from "better-auth/plugins";
import { CryptoHasher } from "bun";
import { env } from "../common/env";
import { logger } from "../common/logger";
import type { EmailTemplates, TemplateVariables } from "./application/ports/email.port";
import { di } from "./di/container";

const isProd = env.NODE_ENV === "production";

function tokenIdempotencyKey(template: string, token: string): string {
  const hash = new CryptoHasher("sha256").update(token).digest("hex").slice(0, 32);
  return `${template}/${hash}`;
}

async function ensurePersonalOrgFor(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: schema.member.organizationId })
    .from(schema.member)
    .where(eq(schema.member.userId, userId))
    .limit(1);
  if (existing) return existing.id;

  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(schema.organization).values({
      id: orgId,
      name: "Personal",
      slug: `personal-${orgId}`,
      createdAt: now,
    });
    await tx.insert(schema.member).values({
      id: memberId,
      organizationId: orgId,
      userId,
      role: "owner",
      createdAt: now,
    });
  });
  return orgId;
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
      throw new Error(`email send failed (${template}): ${error.message}`);
    }
    logger.warn({ template, to, code: error.code }, "email skipped — transport not configured");
  }
}

export const auth = betterAuth({
  appName: "clean-stack",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: drizzleAdapter(db, { provider: "pg" }),

  trustedOrigins: env.CORS_ORIGIN,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      await dispatchEmail(
        "reset_password",
        user.email,
        { name: user.name ?? "", resetUrl },
        tokenIdempotencyKey("reset-password", token),
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true,
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
      teams: {
        enabled: true,
        maximumTeams: 25,
        allowRemovingAllTeams: false,
      },
      organizationHooks: {
        beforeDeleteOrganization: async ({ organization: org }) => {
          if (org.slug.startsWith("personal-")) {
            throw new Error(
              "Personal organization cannot be deleted. Delete your account instead.",
            );
          }
        },
        afterRemoveMember: async ({ organization: org }) => {
          if (org.slug.startsWith("personal-")) return;
          const remaining = await db
            .select({ id: schema.member.id })
            .from(schema.member)
            .where(eq(schema.member.organizationId, org.id))
            .limit(1);
          if (remaining.length === 0) {
            await db.delete(schema.organization).where(eq(schema.organization.id, org.id));
          }
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

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await ensurePersonalOrgFor(user.id);
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
      },
    },
  },
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;

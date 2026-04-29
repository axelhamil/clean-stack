import "@simplewebauthn/server";
import "zod/v4/core";
import { passkey } from "@better-auth/passkey";
import { db } from "@packages/drizzle";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, magicLink, twoFactor } from "better-auth/plugins";
import { env } from "../common/env";
import { sendEmail } from "./adapters/services/email.service";

const isProd = env.NODE_ENV === "production";

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
      const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your password",
        html: `<p>Click the link below to reset your password.</p><p><a href="${url}">Reset password</a></p>`,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const url = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: user.email,
        subject: "Verify your email",
        html: `<p>Welcome${user.name ? ` ${user.name}` : ""}.</p><p><a href="${url}">Verify your email</a></p>`,
      });
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
        const url = `${env.APP_URL}/magic-link?token=${encodeURIComponent(token)}`;
        await sendEmail({
          to: email,
          subject: "Your magic sign-in link",
          html: `<p><a href="${url}">Sign in to clean-stack</a></p>`,
        });
      },
    }),
    passkey({ rpName: "clean-stack" }),
  ],
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type SessionData = typeof auth.$Infer.Session.session;

import { passkeyClient } from "@better-auth/passkey/client";
import { stripeClient } from "@better-auth/stripe/client";
import { ac, roles } from "@packages/access-control";
import type { BetterAuthClientPlugin } from "better-auth/client";
import { magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "../env";

// Cast erases the $InferServerPlugin field that transitively references stripe SDK
// types through apps/api/node_modules — preventing TS2883 without a stripe devDep.
const _stripeClientPlugin = stripeClient({ subscription: true }) as unknown as {
  id: "stripe-client";
  version: string;
  pathMethods: {
    "/subscription/billing-portal": "POST";
    "/subscription/restore": "POST";
  };
} & Pick<BetterAuthClientPlugin, "$ERROR_CODES">;

export const authClient = createAuthClient({
  baseURL: env.VITE_API_URL,
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
    magicLinkClient(),
    passkeyClient(),
    organizationClient({
      ac,
      roles,
    }),
    _stripeClientPlugin,
  ],
});

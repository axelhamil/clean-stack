import { passkeyClient } from "@better-auth/passkey/client";
import { ac, roles } from "@packages/access-control";
import { magicLinkClient, organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "../env";

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
  ],
});

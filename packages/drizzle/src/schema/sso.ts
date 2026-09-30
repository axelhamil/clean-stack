import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./multi-tenant";

// Schema imposed by @better-auth/sso. `domainVerified` is only written once the plugin's
// `domainVerification.enabled` is set, but the column exists now to avoid a later migration.
export const ssoProvider = pgTable(
  "sso_provider",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    oidcConfig: text("oidc_config"),
    samlConfig: text("saml_config"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    domain: text("domain").notNull(),
    domainVerified: boolean("domain_verified").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("sso_provider_provider_id_uidx").on(table.providerId)],
);

// Schema imposed by @better-auth/scim. `userId` is only populated once `providerOwnership`
// is enabled, and `scimToken` stores whatever the plugin writes (plaintext until
// `storeSCIMToken: "hashed"` is configured). Both columns exist now to avoid a later migration.
export const scimProvider = pgTable(
  "scim_provider",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull(),
    scimToken: text("scim_token").notNull(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("scim_provider_provider_id_uidx").on(table.providerId),
    uniqueIndex("scim_provider_token_uidx").on(table.scimToken),
  ],
);

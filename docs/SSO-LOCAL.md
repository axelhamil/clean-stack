# SSO/SCIM local round-trip (Keycloak)

A local IdP for exercising the enterprise SSO (OIDC + SAML) and SCIM flows end-to-end without a real Okta/Entra ID tenant. Opt-in via the `sso` Docker profile — `docker compose up` stays unchanged for everyone not working on SSO.

## Start Keycloak

```bash
docker compose --profile sso up keycloak -d
```

- Admin console: `http://localhost:8080` (user `admin` / `admin`, from `KC_BOOTSTRAP_ADMIN_USERNAME`/`KC_BOOTSTRAP_ADMIN_PASSWORD`).
- `start-dev` mode — no TLS, no persistent volume; every restart is a clean slate. Fine for local testing, never for anything shared.

## One-time: create a realm

Console → **Create realm** → name it `clean-stack` (any name works, this doc assumes it). Or via the admin REST API:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli" -d "username=admin" -d "password=admin" -d "grant_type=password" \
  | jq -r .access_token)

curl -s -X POST http://localhost:8080/admin/realms \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"realm":"clean-stack","enabled":true}'
```

## OIDC client + provider registration

1. Console → realm `clean-stack` → **Clients** → **Create client**:
   - Client ID: e.g. `clean-stack-app`
   - Client authentication: **On** (confidential client — the app needs a secret)
   - Standard flow: **On**
   - Valid redirect URIs: `http://localhost:3000/api/auth/sso/callback/*`
2. **Credentials** tab → copy the client secret.
3. The exact issuer URL to paste when registering the provider (`authClient.sso.register` / `/api/auth/sso/register`):
   ```
   http://localhost:8080/realms/clean-stack
   ```
   The plugin appends `/.well-known/openid-configuration` itself for discovery.
4. **Trusted-origin gotcha**: the SSO plugin validates the discovery URL's origin against the auth server's own `trustedOrigins` (`CORS_ORIGIN`). Add `http://localhost:8080` to `CORS_ORIGIN` in `apps/api/.env` for local testing, or discovery is rejected with `discovery_untrusted_origin`. Never add it in a deployed environment — it exists only to let a local, non-TLS IdP through.

## SAML client + provider registration

SAML is stricter and has two easy-to-miss traps:

1. Keycloak → **Clients** → **Create client**, protocol **SAML**. Set the **Client ID** to a URL you control (it becomes the SP's SAML entity ID — see the trap below), e.g. `http://localhost:3000/sso/sp/<your-provider-id>`. Valid redirect URI: `http://localhost:3000/api/auth/sso/saml2/sp/acs/<your-provider-id>`.
2. **Advanced** tab → disable **Client signature required** (`saml.client.signature`) unless you've also uploaded the SP's exact signing certificate to Keycloak — otherwise every signed `AuthnRequest` this app sends is rejected as `Invalid requester`.
3. Grab the **realm's SAML IdP metadata** for the entry point + certificate:
   ```
   http://localhost:8080/realms/clean-stack/protocol/saml/descriptor
   ```
   `entityID` in that document is the entry point's issuer; the `<dsig:X509Certificate>` is the cert to paste as `samlConfig.cert` (wrap in `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----`, 64-char lines).
4. Register the provider with:
   - `issuer`: the **SP's own entity ID** — must equal the Keycloak client's Client ID from step 1, and must be a URL (`Invalid issuer` otherwise). This is the trap: `@better-auth/sso` reuses this single field as the SP's `entityID` when building the outgoing `AuthnRequest`.
   - `samlConfig.idpMetadata.entityID`: the **IdP's** real issuer (`http://localhost:8080/realms/clean-stack`). Without this, the plugin falls back to `issuer` for the IdP side too, and every assertion fails signature/issuer validation with `ERR_UNMATCH_ISSUER`.
   - `samlConfig.entryPoint`: `http://localhost:8080/realms/clean-stack/protocol/saml`
   - `samlConfig.privateKey` + a matching self-signed `samlConfig.cert`: required because this codebase forces `authnRequestsSigned: true` on every SAML registration (D8 hardening) — generate a throwaway pair with `openssl req -x509 -newkey rsa:2048 -keyout sp_key.pem -out sp_cert.pem -days 365 -nodes -subj "/CN=clean-stack-sp"`.
   - `samlConfig.callbackUrl`: `http://localhost:3000/api/auth/sso/saml2/sp/acs/<your-provider-id>`

## Domain verification

Both flows gate on `domainVerified` (`domainVerification: { enabled: true }` in the server config). The real path is `authClient.sso.verifyDomain({ providerId })`, which does a DNS TXT lookup for `_better-auth-token-<providerId>.<domain>` — meaning it only works against a domain whose DNS you actually control. For a throwaway local domain (`example.test`, a fake company domain, …) there is no DNS to point at, so local testing has to bypass this deliberately:

```sql
update sso_provider set domain_verified = true where provider_id = '<your-provider-id>';
```

This is a **local-only shortcut**. It is why the JIT-provisioning trust check (`validateEmailDomain`) still applies on top — the test IdP user's email domain must match the provider's registered `domain`, or the login is treated as untrusted and any pre-existing account with that email is not auto-linked (`account_not_linked`).

## Business-tier gate

`/sso/register` requires the target org to hold the `sso` feature entitlement (`business` tier, D4). There is no Stripe checkout in local dev, so grant it directly:

```sql
insert into subscription (id, plan, reference_id, status, period_start, period_end)
values ('sub-test-business', 'business', '<organizationId>', 'active', now(), now() + interval '30 days');
```

## Smoke-testing the round trip

With an active session cookie for an org owner:

```bash
curl -X POST http://localhost:3000/api/auth/sign-in/sso \
  -H "Content-Type: application/json" -H "Origin: http://localhost:5173" \
  -d '{"email":"user@your-test-domain.com","callbackURL":"http://localhost:5173/dashboard"}'
```

returns `{ "url": "...", "redirect": true }` — the authorization/AuthnRequest URL to open in a browser. After IdP login, the browser lands back on `callbackURL` with a session cookie set, and a `member` row appears in the target org (JIT provisioning, `organizationProvisioning.defaultRole`).

## SCIM

Generate a token (`providerId` must be distinct from any SSO provider's `providerId` — the plugin rejects a collision):

```bash
curl -X POST http://localhost:3000/api/auth/scim/generate-token \
  -H "Content-Type: application/json" -H "Origin: http://localhost:5173" \
  -d '{"providerId":"<scim-provider-id>","organizationId":"<organizationId>"}'
```

The returned `scimToken` is a bearer token for `/api/auth/scim/v2/Users` (standard SCIM 2.0 `POST`/`GET`/`PUT`/`PATCH`/`DELETE`). `DELETE` is an **org departure**, not a soft-delete: it removes the `member` row for that org only — the global `user` row (and any other org membership) survives untouched.

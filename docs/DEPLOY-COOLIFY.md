# Deploy to a VPS with Coolify (reference)

Runbook for shipping clean-stack on a VPS run by [Coolify](https://coolify.io) v4. The desired state lives in `infra/coolify/services.ts`, `infra/coolify/apply.ts` reconciles it through the Coolify API, and `.github/workflows/deploy.yml` builds the images and deploys them by digest once CI is green.

> **TL;DR**: 1 VPS bootstrapped by `infra/vps/bootstrap.sh` (Tailscale, nftables, unattended upgrades), Coolify pinned, its dashboard and API on a Tailscale tailnet only, Cloudflare in front of the public hosts. 3 Coolify apps (`api`, `app`, `admin`) running `ghcr.io/<owner>/clean-stack-<app>@sha256:<digest>`, 1 Postgres resource per environment made by hand from `ghcr.io/<owner>/clean-stack-postgres@sha256:<digest>` with pgBackRest archiving to R2, the `rgpd-sweep`, `sweep` and `flush-notification-emails` crons as scheduled tasks on `api`. Cloudflare R2, Resend and Sentry stay external.

---

## 0. Hard requirements and gotchas (read this first)

**Boot is fail-hard on these in production**: `NODE_ENV=production`, `BETTER_AUTH_SECRET` (32+ chars), `INTERNAL_SIGNING_KEY` (32+ chars), `WEBHOOK_MASTER_KEY` (64 hex), `API_TOKEN_PEPPER` (32+ chars), `SCIM_CREDENTIAL_HASH_SECRET` (32+ chars), `CORS_ORIGIN`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (see [INTEGRATIONS.md](INTEGRATIONS.md) section 4), `INTERNAL_AUTH_LAYERS` including `signature`, and `APP_URL` (a valid URL at any `NODE_ENV`). Missing any, the boot throws in `apps/api/src/shared/env.ts` and Coolify shows the container restarting.

**Boot degrades gracefully on these**: `RESEND_*` unset logs emails instead of sending them; `S3_*` unset makes uploads answer `STORAGE_PROVIDER_FAILURE` and `/readyz` report `storage:s3 fail` (non-critical). A smoke deploy works without them, those flows do not.

**`NODE_ENV` trap.** The api Dockerfile sets `NODE_ENV=production`, but an environment variable on the Coolify app overrides it. `development` loads `pino-pretty`, a devDependency absent from the `--prod` install: instant crash (`unable to determine transport target for "pino-pretty"`). `apply.ts` writes `NODE_ENV=production`; never change it by hand.

**`app` and `admin`: leave the start command empty.** Their runner image is `caddy:2.11-alpine`, with no Node and no pnpm. A start command replaces the Caddy `CMD` and the container exits with zero logs. `apply.ts` never writes a start command; keep it blank in the dashboard.

**Stop grace must exceed the shutdown deadline.** On a redeploy Coolify stops the old container with `SIGTERM`, then `SIGKILL` after its stop grace period. The api needs up to `SHUTDOWN_DEADLINE_MS` (36 s) to drain HTTP, stop the workers and flush telemetry, so `services.ts` sets `stopGraceSeconds: 45` on `api`. Below it, in-flight emails can be sent twice and the last Sentry batch is lost. Detail: [HEALTH-PROBES.md](HEALTH-PROBES.md#graceful-shutdown-readyz-flips-before-workers-stop).

**Migrations run at api start, so keep one api replica.** The container runs `bun apps/api/src/migrate.ts && bun apps/api/src/index.ts`. Two replicas starting together race on the same migration. CI cannot reach the database (no tailnet path to Postgres), so the migrator stays in the container. A failed migration crash-loops the new container while the old one keeps serving: Coolify marks the deployment failed and `deploy.ts` stops before `app` and `admin`.

**Migration `0036` refuses duplicates.** It creates a unique index on `user.stripe_customer_id`. Before the first deploy of a release that ships it on a database with existing users, run this pre-flight query against Postgres; it must return zero rows, or the migration fails and the api crash-loops:

```sql
select stripe_customer_id, count(*) from "user"
where stripe_customer_id is not null
group by 1 having count(*) > 1;
```

**Stop the old api before a release that ships outbox migration `0024`.** An api built before it recreates the `outbox_notify` trigger every time it boots. Stop the `api` app in Coolify before deploying that release so no old container restarts after the migration. See `docs/EVENTS.md`, delivery section.

**The crons call the api on loopback.** Three scheduled tasks run inside the `api` container with `API_URL=http://localhost:3000`, so `INTERNAL_AUTH_LAYERS=signature,private-network` holds: the `private-network` layer accepts loopback and refuses anything that comes through Traefik. `rgpd-sweep` (`bun apps/api/src/cron/rgpd-sweep.ts`, 02:47 UTC, required for Art. 17) wipes the accounts past their grace window, `sweep` (`bun apps/api/src/cron/sweep.ts`, 03:17 UTC) chains the retention sweeps, `flush-notification-emails` (`bun apps/api/src/cron/flush-notification-emails.ts`, every minute) enqueues the notification digests. Details in [CRON.md](CRON.md).

---

## 1. What lives where

| Piece | Where | Managed by |
| --- | --- | --- |
| Desired apps, ports, health checks, stop grace, literal env, scheduled tasks | `infra/coolify/services.ts` | `apply.ts` (dry run by default, `--apply` writes, never deletes) |
| Image build and deploy by digest, release sha, gates | `.github/workflows/deploy.yml`, `infra/coolify/deploy.ts`, `infra/coolify/gates.ts` | GitHub Actions after a green CI |
| Rollback to previous digests | `.github/workflows/rollback.yml` | manual dispatch |
| Secrets and operator values (`DATABASE_URL`, URLs, keys) | Coolify app environment | the operator, by hand; `apply.ts` reports the missing ones and never writes or prints a value |
| Domains, Postgres resource, registry login | Coolify dashboard and the host | the operator, by hand |
| Host firewall, Tailscale, unattended upgrades, backup timers | `infra/vps/` | `bootstrap.sh`, run once as root, safe to rerun |
| Postgres image with pgBackRest, its config, restore drills | `infra/docker/postgres-pgbackrest.Dockerfile`, `infra/pgbackrest/`, `.github/workflows/pgbackrest-drill.yml` | built by `deploy.yml`, upgraded by hand (section 13) |

The Dockerfiles (`apps/*/prod.Dockerfile`) and Caddyfiles are portable: nothing Coolify specific lives in them.

---

## 2. The host

`infra/vps/bootstrap.sh` sets the host up from a checkout of the repo, as root, on a fresh **Debian 13** (it refuses anything else). It installs unattended security upgrades with a reboot at 05:30 UTC (after the 00:00 backups and their 4 h grace, and after the 05:00 check), Docker CE on the iptables backend, Tailscale with Tailscale SSH (tag `tag:server`), and the nftables firewall `infra/vps/host.nft` as the `clean-stack-host-firewall` unit, loaded before Docker. The firewall drops every inbound packet except loopback, established flows, `tailscale0`, the Coolify bridge to the host sshd, and TCP 80 and 443 from the [Cloudflare ranges](https://www.cloudflare.com/ips/), fetched by the script into `/etc/clean-stack/cloudflare.nft`. A published container port is DNAT then forward, never input, so the same rule sits in a forward chain, matched on the original destination port (`ct original proto-dst`) since DNAT has already rewritten it to the container's port: whatever Docker opens, only Cloudflare reaches 80 and 443 from the public interface. After loading it, the script fails unless every `public_interfaces` entry exists under `/sys/class/net` and the default route (`ip -o route get 1.1.1.1`) leaves through one of them. Docker's own tables stay untouched.

1. A VPS with 4 GB RAM or more (the image builds run in GitHub Actions, not on the VPS), Debian 13, in an EU region for RGPD. Check that the provider's console or rescue mode works: it is the break glass once public SSH is closed.
2. `mkdir -p /etc/clean-stack`, copy `infra/vps/host.local.nft.example` to `/etc/clean-stack/host.local.nft` and set the public interface (`ip -br link`). Keep the `container_to_host` line for now; step 5 fills it.
3. `TS_AUTHKEY=<one off key> infra/vps/bootstrap.sh --hostname <tailnet name>`. Last line: `host <name> ready`. Prove `ssh root@<tailnet name>` over Tailscale SSH from a second terminal before going further.
4. Install Coolify v4 at a pinned version (pass the version to the install script, never the floating latest), then set `AUTOUPDATE=false` in `/data/coolify/source/.env`. Note the version installed in your ops notes.
5. Coolify manages its own host over SSH from its container. Put the bridge of the `coolify` Docker network in `container_to_host`: `echo br-$(docker network inspect coolify -f '{{.Id}}' | cut -c1-12)`, edit `/etc/clean-stack/host.local.nft`, then `systemctl reload clean-stack-host-firewall`. Keep sshd running for that bridge, key only (`PasswordAuthentication no`); the firewall already drops it on the public interface.
6. Set the Coolify instance domain to the host's tailnet name: the dashboard and the API answer on the tailnet only. Never expose the dashboard publicly.
7. Registry access: the GHCR packages are private by default. On the host, `docker login ghcr.io` with a token that only has `read:packages`, or add it as a private registry in Coolify, so Coolify can pull `ghcr.io/<owner>/clean-stack-*`.
8. Back up `/data/coolify/source/.env` (its `APP_KEY` decrypts Coolify's own database) and `/data/coolify/ssh/keys` in a password manager.

Verify: reboot, then `systemctl is-active clean-stack-host-firewall` answers `active` and `nft list set inet clean_stack_host public_interfaces` shows the interface; from outside the tailnet, `nmap -Pn -p- <public ipv4>` shows every port filtered (80 and 443 answer only through Cloudflare). Rerun `bootstrap.sh` to refresh the Cloudflare ranges.

---

## 3. Cloudflare in front

- DNS: `api.<domain>`, `app.<domain>`, `admin.<domain>` as proxied records to the VPS public IP. SSL mode **Full (strict)**; Coolify's Traefik gets the origin certificates from Let's Encrypt over HTTP through Cloudflare, so keep `/.well-known/acme-challenge/` reachable on port 80 (no Cloudflare rule that blocks it). Only Cloudflare reaches 80 and 443 (section 2): a record that is not proxied stops answering.
- Behind Cloudflare and Traefik, the api resolves the client IP from `X-Forwarded-For` through the trusted private hop (`TRUSTED_PROXIES=private`). Verify on the real server (section 11) that two clients get two rate-limit keys.

---

## 4. Coolify project, environments and Postgres

1. Create one project (e.g. `clean-stack`) with two environments named exactly `staging` and `production`. `apply.ts` and `deploy.ts` find them by name. Note the project uuid and the server uuid.
2. In each environment, create a **Postgres 18** database resource by hand from the image of section 13, with its persistent storage mounted on `/var/lib/postgresql`. Copy its internal URL: it becomes `DATABASE_URL` on the `api` app of that environment. Backups and their timers: section 13.
3. Never run `api` with more than one replica (section 0, migrations).

---

## 5. Tokens

Coolify API tokens, one per use, never shared, each revocable on its own:

- `COOLIFY_DEPLOY_TOKEN`, one per GitHub environment: read, write and deploy, never `read:sensitive`. `deploy.ts` writes `GIT_SHA` and the image digest on each app before `POST /api/v1/deploy`, which the deploy permission alone does not allow.
- `COOLIFY_APPLY_TOKEN`: read and write, never `read:sensitive`, on the owner's machine only, never in GitHub. `apply.ts` reads it.

Without `read:sensitive` Coolify lists every env key but hides its value: `apply.ts` then knows a secret is set, not what it holds, and `deploy.ts` cannot read back the previous `GIT_SHA` of an app it restores (section 8).

---

## 6. GitHub environments, secrets and variables

Create the environments `staging` and `production`. Add no deployment branch rule to either: on a `workflow_run` event `github.ref` is the default branch (`develop`) for both environments, so a `main` rule on `production` would refuse every production deploy and a `develop` rule would let any `develop` run pass. `deploy.yml` routes by `workflow_run.head_branch` instead: only a CI run on `main` selects `production`. Protect `production` with required reviewers, so every production deploy waits for a maintainer approval.

| Kind | Name | Scope | Value |
| --- | --- | --- | --- |
| Secret | `COOLIFY_API_URL` | environment | `http://<tailnet name of the host>:8000` |
| Secret | `COOLIFY_DEPLOY_TOKEN` | environment | section 5 |
| Secret | `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET` | environment | a Tailscale OAuth client allowed to create ephemeral `tag:ci` nodes that reach the Coolify API |
| Variable | `VITE_API_URL`, `VITE_APP_URL`, `VITE_ADMIN_URL` | environment | the public `https://` URLs; baked into the bundles and used by the gates |
| Variable | `VITE_SENTRY_DSN`, `VITE_ADMIN_SENTRY_DSN` | environment | Sentry DSNs of the app and the admin, empty for none |
| Variable | `VITE_ANALYTICS_SRC` | environment | the analytics script URL the app loads once `analytics` is consented, empty for none |
| Variable | `COOLIFY_PROJECT_UUID` | repository | section 4 |
| Variable | `COOLIFY_DEPLOY` | repository | `on` once both environments exist in Coolify; any other value skips every deploy |
| Secret | `PGBACKREST_REPO1_S3_ENDPOINT`, `PGBACKREST_REPO1_S3_KEY`, `PGBACKREST_REPO1_S3_KEY_SECRET`, `PGBACKREST_REPO1_CIPHER_PASS` | environment `pgbackrest-drill` | the R2 endpoint, a **read-only** R2 key on the backup bucket, the production cipher passphrase (section 13) |
| Secret | `HEARTBEAT_URL_PGBACKREST_DRILL` | environment `pgbackrest-drill` | a heartbeat check for the monthly drill, empty for none |
| Variable | `PGBACKREST_REPO1_S3_BUCKET`, `PGBACKREST_REPO1_PATH`, `PGBACKREST_DRILL_DATABASE`, `PGBACKREST_DRILL_USER` | environment `pgbackrest-drill` | default `clean-stack-pgbackrest`, `/production`, `postgres` and `postgres`: the database the drill queries and the role it queries as |
| Variable | `PGBACKREST_DRILL_ENABLED` | repository | `true` once a manual run of `pgBackRest drill` passed; anything else skips the schedule |

Restrict the deployment branches of `pgbackrest-drill` to `develop` and `main`. A scheduled run executes on the default branch, so `github.ref` is `develop`; the job then checks out `main`. A manual run is accepted from `main` only, by the `if` of the job. The R2 key is read-only, which bounds what a `develop` run can reach.

`COOLIFY_DEPLOY` is off on a fresh clone: CI never tries to deploy before the operator says so.

---

## 7. First apply

On the owner's machine, on the tailnet:

```bash
export COOLIFY_API_URL=http://<tailnet name>:8000
export COOLIFY_APPLY_TOKEN=<token>
export COOLIFY_PROJECT_UUID=<project uuid>
export COOLIFY_SERVER_UUID=<server uuid>

bun infra/coolify/apply.ts --environment staging --owner <github owner>          # dry run
bun infra/coolify/apply.ts --environment staging --owner <github owner> --apply  # writes
```

Expected: `create api`, `create app`, `create admin`, then one `warning: <app> misses secrets to set in Coolify: ...` line per app. Then, in the Coolify dashboard:

1. Set every reported key on its app. On `api`: `DATABASE_URL` (section 4), `BETTER_AUTH_URL` (the api public URL), `APP_URL`, `ADMIN_URL`, `CORS_ORIGIN` (the app origin), the keys of section 0 (`openssl rand -hex 32` for each 32+ char key, `openssl rand -base64 32` for `BETTER_AUTH_SECRET`), `RESEND_*`, `S3_*`, `STRIPE_*`, `SENTRY_DSN` (empty for none). On `app` and `admin`: `VITE_API_URL` (Caddy templates the CSP with it at runtime); on `admin`: `CSP_CONNECT_EXTRA` (the Sentry ingest origin when a DSN is set, else empty).
2. Optional api keys apply never manages and never removes: `AUTH_COOKIE_DOMAIN`, `PLATFORM_ADMIN_IDS`, `SWEEP_HEARTBEAT_URL`, `API_TOKEN_PREFIX` (change it per clone), the knobs of `apps/api/.env.example`.
3. Set each app's domain (`https://api.<domain>` and so on).

Rerun the dry run: it must report no change and no missing secret. A secret counts as set when its key exists in Coolify; an empty value counts as missing when Coolify shows it. Without `read:sensitive` every value is hidden, so the dry run reports literals as unreadable rather than changed: a literal is a change only when its key is absent or its readable value differs, and `--apply` rewrites every literal anyway through the idempotent bulk upsert. Repeat for `production`. Literal values (`NODE_ENV`, `PORT`, `API_URL`, `INTERNAL_AUTH_LAYERS`, `TRUSTED_PROXIES`, `RATE_LIMIT_STORE`, `S3_REGION`, `S3_FORCE_PATH_STYLE`, `SENTRY_ENVIRONMENT`, `SHUTDOWN_DEADLINE_MS`) come from `services.ts`: change them there, not in the dashboard, or the next apply reverts them.

---

## 8. Deploys

`deploy.yml` runs on `workflow_run` of `CI`, completed, on `develop` and `main`. It does anything only when that run succeeded, was a push (not a pull request), came from this repository and `COOLIFY_DEPLOY` is `on`. `develop` deploys to `staging`, `main` to `production`.

GitHub fires `workflow_run` only from the workflow file on the default branch. With `develop` as the default branch, an edit of `deploy.yml` merged on `develop` takes effect at once, for staging and production alike. For the same reason `github.ref` is `develop` for both environments (section 6).

1. **Build**: the three `apps/*/prod.Dockerfile` images, tagged `sha-<commit>` and pushed to GHCR; the job outputs their digests.
2. **Deploy**: `deploy.ts` deploys `api`, then `app`, then `admin`, within one 45 min budget (the job allows 60). Before `api` it waits for an idle `sweep` and `rgpd-sweep` (never for the per-minute flush): only the latest execution counts, and one older than the task timeout plus 5 min counts as ended. One still running after 30 min skips `api`, and the run stops there. Per app it notes the current image and `GIT_SHA`, writes the new ones, starts the deployment and follows it. When that fails or outlives the budget it writes the noted image and `GIT_SHA` back (a hidden `GIT_SHA` stays at the new release, and the report says so) and stops. The report gives every app's state, `app` and `admin` read `not deployed` after an `api` skip or failure, and the job fails. A deployment that outlived the budget reads `still running in Coolify, config restored`: check it in the dashboard. A failed restore reads `restore failed`: fix the image and `GIT_SHA` by hand.
3. **Gates**: `gates.ts` asks `<api>/readyz`, `<app>/health` and `<admin>/health` for a 200, 5 tries 5 s apart each.

Every image is a digest of the commit CI tested (`workflow_run.head_sha`), never a tag. Two deploys of one environment never run at once (`concurrency: deploy-<env>`, no cancel).

Verify by hand after the first deploy:

```bash
curl -i https://api.<domain>/livez     # 200 {"status":"pass","uptimeMs":...}
curl -i https://api.<domain>/readyz    # 200, "warn" if storage is unconfigured, 503 if Postgres is down
curl -i https://api.<domain>/internal/build-info   # 401 unsigned
curl -i https://app.<domain>/health    # 200 "OK"
```

Then the smoke test: sign up through the UI and receive the email, create an organization, upload an avatar, request an RGPD export (an `outbox_event` and an `audit_log` row with an actor), force a 500 and see it in Sentry with the release sha, and run each task once from the Coolify dashboard (expect one `[sweep] OK` line per sweep, one `[rgpd-sweep] OK` line, one `[flush-notification-emails] OK` or `SKIPPED` line).

---

## 9. Rollback

Run **Rollback** (`rollback.yml`) with the environment, the commit sha and the `sha256:<64 hex>` digests to restore (empty leaves an app as is). Pick them from a previous `Deploy` run log or the GHCR package history. `production` only from `main`. No image is built.

The rolled back api still runs its migrator at start, which has nothing to apply on a newer schema, but the old code then runs against the newer schema. Never roll the api back across a migration that drops or renames something the old code reads.

---

## 10. Domains, cookies and secrets

**Cookie topology.** With `app.<domain>`, `api.<domain>` and `admin.<domain>` under one parent, the session cookie is same-site and `SameSite=Lax` would be enough; `auth.ts` sets `SameSite=None; Secure` in production, which works for both topologies. Platform domains under a public suffix are different sites: no `AUTH_COOKIE_DOMAIN` can span them, so `admin` needs your own domain in production.

**`AUTH_COOKIE_DOMAIN` is off by default.** Once set, every host under that domain receives the session cookie: never set it if a subdomain serves user content or a third party. A public suffix, or a value that is not a parent of `APP_URL`, `BETTER_AUTH_URL` and `ADMIN_URL`, refuses the boot. Break-glass when a cookie change locks staff out: `PLATFORM_ADMIN_IDS` plus removing `AUTH_COOKIE_DOMAIN`.

These four must agree and point at public URLs: api `BETTER_AUTH_URL` (api URL), api `CORS_ORIGIN` (app origin, never `*`), api `APP_URL` (app URL), build variable `VITE_API_URL` (api URL). Check:

```bash
curl -i -X OPTIONS -H "Origin: https://app.<domain>" -H "Access-Control-Request-Method: GET" https://api.<domain>/me
# 204 + access-control-allow-origin: https://app.<domain> + access-control-allow-credentials: true
```

**API token pepper rotation** (annually or on suspected exposure): set `API_TOKEN_PEPPER` to a new `openssl rand -hex 32`, `API_TOKEN_PEPPER_PREVIOUS` to the old one, bump `API_TOKEN_PEPPER_VERSION`, redeploy. Rows migrate lazily on use; once `select pepper_version, count(*) from api_token where revoked_at is null group by 1` shows no old version, clear `API_TOKEN_PEPPER_PREVIOUS` and redeploy.

**External services.** R2: a bucket in the EU jurisdiction, public access off, lifecycle rules `tmp/` 30 days and `backups/` 365 days, an API token scoped to the bucket (Object Read and Write); `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_PUBLIC_URL=https://<bucket>.<account>.r2.cloudflarestorage.com`. Resend: verified domain (SPF, DKIM, DMARC), EU region, a `sending_access` key, and the template ids of `packages/email/src/email-delivery-worker.ts` filled in. Sentry: an EU organization (`*.eu.sentry.io` DSN), one project per app.

---

## 11. Open checks on a real server

The Coolify API calls follow the Coolify v4 API reference and the sister project that runs them; note the observed result on each line the first time.

- [ ] A digest in the image field: `docker_registry_image_tag` set to `sha256:<digest>` is accepted and the container runs that digest (`docker inspect --format '{{.Image}}'`). Observed:
- [ ] `health_check_command` (`wget -qO- http://127.0.0.1:<port><path>`) is honoured and Coolify shows each app healthy. Observed:
- [ ] The deploy token with read, write and deploy can update the image and start a deployment. Observed:
- [ ] The `rgpd-sweep` task runs at 02:47 UTC, `sweep` at 03:17 UTC, `flush-notification-emails` every minute, and their executions show up in `GET /applications/<uuid>/scheduled-tasks/<task>/executions`. Observed:
- [ ] Client IP behind Cloudflare and Traefik: two clients get two rate-limit keys; if every request shares a Cloudflare edge address, add the Cloudflare ranges to `TRUSTED_PROXIES` in `services.ts`. Observed:
- [ ] `docker stop` of the api takes under 45 s and the log shows every shutdown step. Observed:
- [ ] The Postgres resource runs the custom image with the volume on `/var/lib/postgresql`, its environment reaches the container (`docker exec <container> env | grep -c PGBACKREST_REPO1`), and with "Custom PostgreSQL Configuration" empty the image's `CMD` loads `/etc/postgresql/postgresql.conf` (`show archive_mode` answers `on`). Observed:
- [ ] `pgbackrest --stanza=clean-stack info` shows WAL archived continuously, and a stopped container makes `systemctl start clean-stack-pgbackrest@diff.service` fail and ping `/fail`. Observed:
- [ ] Coolify still manages its own host once the firewall is loaded (server validated, `container_to_host` holds the `coolify` bridge). Observed:
- [ ] From outside the tailnet, IPv4 and IPv6: `nmap -Pn -p- <public ip>` shows every port filtered, and the public hosts still answer through Cloudflare. Observed:
- [ ] `pgBackRest drill` run by hand on `main`: both restores promoted, migrations counted, RTO noted. Observed:

---

## 12. Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Deploy` never starts after a push | `COOLIFY_DEPLOY` is not `on`, or `CI` did not succeed on that push |
| `deploy.ts`: `<app> is missing from coolify in <env>` | run `apply.ts --apply` for that environment first |
| `deploy.ts`: `several applications named <app>` | two apps share the name in one environment: keep one |
| `deploy.ts` cannot reach Coolify | the runner did not join the tailnet (`TS_OAUTH_*`) or `COOLIFY_API_URL` is not the tailnet URL |
| Coolify cannot pull the image | no registry login on the host for `ghcr.io` (section 2) |
| api restarts in a loop right after a deploy | a failed migration (check the log; for `0036` see section 0) or a missing boot secret (`apply.ts` dry run lists it) |
| api boot crash `unable to determine transport target for "pino-pretty"` | `NODE_ENV` changed by hand; rerun `apply.ts --apply` |
| `app` or `admin` exits with no logs | a start command set in the dashboard replaces the Caddy `CMD`: clear it |
| `app` blank page | `VITE_API_URL` build variable missing or not a public `https://` URL: fix it in the GitHub environment and redeploy |
| Login succeeds, session lost on the next request | cookie not sent across sites: HTTPS everywhere and section 10 |
| `/internal/build-info` shows `unknown` | `GIT_SHA` not written: the app was deployed from the dashboard, not by `deploy.ts` |
| Sweep answers 401 | `API_URL` is not loopback, so `private-network` refuses it: keep `http://localhost:3000` |
| R2 answers 403 on a presigned URL | the R2 token lacks Object Read and Write on the bucket |
| Coolify shows its own server unreachable after `bootstrap.sh` | the `coolify` bridge is missing from `container_to_host` (section 2, step 5) |
| A public host times out behind Cloudflare | `/etc/clean-stack/cloudflare.nft` is stale or the record is not proxied: rerun `bootstrap.sh`, check the orange cloud |
| `pgbackrest check` fails with `archive_command` errors | an S3 or cipher variable is missing on the Postgres resource, or the bucket path is not the one `stanza-create` used |
| `pg_wal` grows and the disk fills | archiving fails: `pgbackrest check`, then the resource's log; the async queue drops WAL past 5 GiB |

---

## 13. Postgres backups with pgBackRest

Each Postgres resource archives its WAL continuously and takes its backups with pgBackRest to an R2 bucket, encrypted. Why, retention, restore and drills: [DISASTER-RECOVERY.md](DISASTER-RECOVERY.md).

**The image.** `deploy.yml` builds `infra/docker/postgres-pgbackrest.Dockerfile` (Postgres 18 pinned by digest, pgBackRest 2.60.0) on every deploy and prints `ghcr.io/<owner>/clean-stack-postgres@sha256:<digest>` in the run summary. It never deploys it: the database restarts only when the operator says so.

**The bucket and its keys.** One R2 bucket for backups only (`clean-stack-pgbackrest` unless you set `PGBACKREST_REPO1_S3_BUCKET`), EU jurisdiction, public access off, **no lifecycle rule**. One R2 token with Object Read and Write on that bucket for the resources, one with Object Read only for the drill (section 6).

**Per environment, in Coolify:**

1. On the Postgres resource: image `ghcr.io/<owner>/clean-stack-postgres@sha256:<digest>`, persistent storage on `/var/lib/postgresql`, "Custom PostgreSQL Configuration" left empty (the image's `CMD` loads `/etc/postgresql/postgresql.conf`; a custom one replaces that file whole, so it must keep the archive settings).
2. Free disk: the host disk holds the volume (the database and its `pg_wal`) and the container's spool `/var/spool/pgbackrest`, where up to 5 GiB of WAL queue while R2 is unreachable (`archive-push-queue-max=5GiB`), and `pg_wal` keeps growing until the queue drains. Keep at least 10 GiB free beyond the database size, more for a write-heavy one, and turn on Coolify's disk usage notification.
3. Environment variables of the resource:

| Key | Value |
| --- | --- |
| `PGBACKREST_REPO1_S3_ENDPOINT` | `<account>.r2.cloudflarestorage.com`, no scheme |
| `PGBACKREST_REPO1_PATH` | `/production` or `/staging`: never the same path for two environments |
| `PGBACKREST_REPO1_S3_KEY`, `PGBACKREST_REPO1_S3_KEY_SECRET` | the read and write R2 token |
| `PGBACKREST_REPO1_CIPHER_PASS` | `openssl rand -base64 48`, one per environment, kept in a password manager: lost, every backup is unreadable |

4. Start the resource, then on the host: `docker exec --user postgres <container> pgbackrest --stanza=clean-stack stanza-create`, then `... check`. Expect `check command end: completed successfully`.

**On the host, once for all environments:** copy `infra/vps/pgbackrest.env.example` to `/etc/clean-stack/pgbackrest.env`, set `PGBACKREST_CONTAINERS` to the container names of the resources, space separated (`docker ps --format '{{.Names}}'`), and the optional `HEARTBEAT_URL_PGBACKREST_FULL`, `_DIFF`, `_CHECK` (one Healthchecks check each, cron UTC `0 0 * * 0` grace 4 h, `0 0 * * 1-6` grace 4 h, `0 5 * * *` grace 1 day). Then `infra/vps/bootstrap.sh --hostname <tailnet name> --pgbackrest`: it installs `/usr/local/sbin/pgbackrest-run.sh` and the timers `clean-stack-pgbackrest-{full,diff,check}.timer` (full Sunday 00:00 UTC, differential Monday to Saturday 00:00 UTC, check daily 05:00 UTC), one run at a time under a lock, each waiting up to 2 min for `pg_isready`. The pings follow `apps/api/src/cron/http-heartbeat.ts` on purpose, in bash because the host has no bun. Verify: `systemctl list-timers 'clean-stack-pgbackrest-*'` lists three, and `systemctl start clean-stack-pgbackrest@full.service` takes the first full backup. Coolify schedules tasks on applications, not on database resources, hence systemd.

**Upgrading the image by hand** (a pgBackRest or Postgres minor release, same major): take the digest from the latest `Deploy` run summary, set it on the resource during a quiet hour, restart it (a few seconds of downtime, the api reconnects), then `pgbackrest --stanza=clean-stack check`. Do staging first. A new Postgres **major** is not an image bump: plan a `pg_upgrade` plus `stanza-upgrade`, or a dump and reload into a new repository path (DISASTER-RECOVERY.md, caveats).

**Drills.** `bash infra/pgbackrest/drill.sh` on any machine with Docker proves backup and PITR on a throwaway local S3. `pgBackRest drill` (`pgbackrest-drill.yml`) restores the real production repository monthly once `PGBACKREST_DRILL_ENABLED` is `true`; run it by hand once first.

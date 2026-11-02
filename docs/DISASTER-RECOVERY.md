# Disaster recovery

> **TL;DR**: on the reference deploy (Postgres as a Coolify resource on your VPS), clean-stack ships **pgBackRest** with continuous WAL archiving to an S3-compatible bucket (Cloudflare R2), encrypted with `aes-256-cbc`: a full backup every Sunday, a differential every other day, a daily `check`, a local restore drill and a monthly restore drill in CI. On a managed Postgres (Neon, Supabase, RDS), turn on the provider's PITR instead and skip the pgBackRest parts. A weekly logical `pg_dump` stays an optional extra against vendor lock-in.

This doc covers: RPO and RTO, the 3-2-1 rule, what ships, the repository and its keys, the schedule and retention, the restore runbook (side, point in time, in place), the drills, the managed-Postgres alternative, the optional logical export, the bucket rules and known caveats. Coolify setup steps live in [DEPLOY-COOLIFY.md](DEPLOY-COOLIFY.md#13-postgres-backups-with-pgbackrest).

## RPO / RTO targets

| Metric | pgBackRest PITR (reference deploy) | Provider PITR (managed Postgres) | Weekly `pg_dump` only |
|---|---|---|---|
| **RPO** (max data loss) | about 1 min: `archive_timeout = 60` forces a WAL segment out every minute | 1 to 5 min | up to 7 days |
| **RTO** (max downtime) | 30 to 60 min, measured by each drill (`RTO <n>s` in its log) | about 1 h | 2 to 4 h |

The unattended upgrades reboot the host at 05:30 UTC, after the 4 h backup grace and the 05:00 check.

The RPO holds only while archiving keeps up: `archive-async` queues WAL in a local spool and `archive-push-queue-max=5GiB` drops WAL rather than fill the disk if the bucket is unreachable for long. A dropped segment breaks PITR across that gap until the next full backup, which is why the daily `check` pings a heartbeat.

## 3-2-1 rule applied

| Copy | Where | Who manages it |
|---|---|---|
| **Live** | The Coolify Postgres resource on the VPS volume | Postgres |
| **Backups and WAL** | The R2 bucket, encrypted, another provider than the VPS | pgBackRest, scheduled by systemd timers on the host |
| **Optional logical export** | A second bucket or region, `pg_dump` | You (recipe below) |

The VPS and R2 are two providers, so losing the VPS account leaves the backups. Losing the R2 account or the cipher passphrase loses every backup: keep the passphrase in a password manager outside both, and consider the optional export to another provider.

## What ships

| Piece | Path |
|---|---|
| Postgres 18 image with pgBackRest 2.60.0, pinned by digest | `infra/docker/postgres-pgbackrest.Dockerfile`, built by `.github/workflows/deploy.yml`, never deployed by it |
| pgBackRest config: stanza `clean-stack`, R2 repository, `aes-256-cbc`, 4 full and 7 differential, async archive | `infra/pgbackrest/pgbackrest.conf` |
| Postgres config: `wal_level = replica`, `archive_mode = on`, `archive_command` through pgBackRest | `infra/pgbackrest/postgresql.conf` |
| Host timers (full, diff, check) with optional heartbeat pings | `infra/vps/bootstrap.sh --pgbackrest`, `infra/vps/pgbackrest-run.sh`, `infra/vps/pgbackrest.env.example` |
| Local drill: backup, then PITR restore, count checked | `infra/pgbackrest/drill.sh`, `infra/pgbackrest/docker-compose.drill.yaml` |
| Monthly drill against the real repository, read-only key | `.github/workflows/pgbackrest-drill.yml` |
| Guards on all of the above | `infra/pgbackrest/pgbackrest-config.test.ts`, `infra/vps/host.test.ts` |

No secret lives in a file: the bucket keys and the cipher passphrase come from the environment of the container (`PGBACKREST_REPO1_S3_KEY`, `PGBACKREST_REPO1_S3_KEY_SECRET`, `PGBACKREST_REPO1_CIPHER_PASS`), and an environment variable overrides the config file, so `PGBACKREST_REPO1_PATH` and `PGBACKREST_REPO1_S3_BUCKET` pick the environment's repository.

## pgBackRest status

pgBackRest's long-time maintainer stepped down on 2026-04-27. The project was revived on 2026-05-18 by a group of sponsors (AWS, Supabase, Percona and others) and keeps releasing: 2.60.0 shipped on 2026-10-18, the version this image pins. A fork, pgxbackup, was announced at the same time; clean-stack stays on upstream. Watch the [news page](https://pgbackrest.org/news.html) before each image upgrade.

## Repository and keys

- **Bucket**: one R2 bucket for backups only (default name `clean-stack-pgbackrest`), EU jurisdiction, public access off, never the uploads bucket of the api. One path per environment: `/production` (the default in the config) and `/staging`.
- **Write key**: an R2 token with Object Read and Write on that bucket only, set on the Postgres resource of each environment. pgBackRest needs delete too, for `expire`.
- **Read-only key**: an R2 token with Object Read only, for the monthly drill in GitHub. A leaked drill secret can read encrypted backups, never delete them.
- **Cipher passphrase**: `openssl rand -base64 48`, one per environment, set once at `stanza-create` and never changed. Without it the repository is unreadable.

## Schedule and retention

| Run | When (UTC) | What |
|---|---|---|
| WAL archiving | continuous, at least one segment a minute | `archive_command` pushes each segment through the async spool |
| Full backup | Sunday 00:00 | `clean-stack-pgbackrest-full.timer` |
| Differential backup | Monday to Saturday 00:00 | `clean-stack-pgbackrest-diff.timer` |
| `pgbackrest check` | daily 05:00 | `clean-stack-pgbackrest-check.timer`, proves archiving works end to end |
| Monthly drill | the 12th, 04:00, once `PGBACKREST_DRILL_ENABLED=true` | `pgbackrest-drill.yml` |

`repo1-retention-full=4` keeps four full backups (about four weeks of PITR), `repo1-retention-diff=7` the last seven differentials. pgBackRest expires older backups and their WAL itself after each backup. The timers are `Persistent=true`: a run missed while the host was down starts at boot. Runs never overlap: each takes a `flock` on `/run/clean-stack-pgbackrest.lock` and waits up to 2 min for `pg_isready` in the container (after a reboot or a resource restart) before it starts. Each run pings `<url>/start`, then `<url>` or `<url>/fail` when its heartbeat URL is set, the same protocol as `apps/api/src/cron/http-heartbeat.ts`, rewritten in bash on purpose since the host has no bun.

## Restore runbook

Always restore to the side first, unless the live cluster is already gone. Commands assume the image `ghcr.io/<owner>/clean-stack-postgres@sha256:<digest>` and the environment of the repository to read (`PGBACKREST_REPO1_S3_ENDPOINT`, `PGBACKREST_REPO1_S3_BUCKET`, `PGBACKREST_REPO1_PATH`, both keys, the cipher passphrase) exported in the shell.

### 1. List what can be restored

```bash
IMAGE=ghcr.io/<owner>/clean-stack-postgres@sha256:<digest>
REPO=(--env PGBACKREST_REPO1_S3_ENDPOINT --env PGBACKREST_REPO1_S3_BUCKET --env PGBACKREST_REPO1_PATH \
  --env PGBACKREST_REPO1_S3_KEY --env PGBACKREST_REPO1_S3_KEY_SECRET --env PGBACKREST_REPO1_CIPHER_PASS)

docker run --rm "${REPO[@]}" --entrypoint pgbackrest "$IMAGE" --stanza=clean-stack info
```

Expect the backups with their timestamps and the WAL range: a point in time is restorable when it falls after the oldest full backup's start and before the last archived segment.

### 2. Restore to the side

```bash
docker volume create pg-side
docker run --rm -v pg-side:/var/lib/postgresql --entrypoint sh "$IMAGE" -c 'mkdir -p "$PGDATA" && chmod 0700 "$PGDATA"'
docker run --rm -v pg-side:/var/lib/postgresql "${REPO[@]}" --entrypoint pgbackrest "$IMAGE" \
  --stanza=clean-stack --archive-mode=off \
  --type=time "--target=2026-11-01 03:00:00+00" --target-action=promote restore
docker run -d --name pg-side -v pg-side:/var/lib/postgresql "${REPO[@]}" "$IMAGE" \
  postgres -c config_file=/etc/postgresql/postgresql.conf -c archive_mode=off
```

Drop `--type=time --target=... --target-action=promote` to restore the latest state (end of the archived WAL). `--archive-mode=off` and `-c archive_mode=off` keep the side instance from pushing WAL into the live repository: never start a restored copy with archiving on, it would fork the timeline the live cluster writes to.

Wait until `docker exec pg-side psql -U postgres -Atqc 'select pg_is_in_recovery()'` answers `f`.

### 3. Verify

```bash
docker exec pg-side psql -U postgres -d <database> -Atqc 'select 1'
docker exec pg-side psql -U postgres -d <database> -Atqc 'select count(*), max(created_at) from drizzle.__drizzle_migrations'
docker exec pg-side psql -U postgres -d <database> -Atqc 'select count(*) from "user"'
docker exec pg-side psql -U postgres -d <database> -Atqc 'select max(created_at) from outbox_event'
```

The migration count must match the release that ran at the target time, and the latest `outbox_event` must sit just before the target: every state change emits one, so it is the best clock of the last write you kept.

### 4. Decide

| Situation | Action |
|---|---|
| A bad write at a known minute, schema intact | **PITR in place** to just before it (section 5) |
| The VPS or its volume is lost | **Latest in place** on a new resource (section 5, without a target) |
| Ransomware, account compromise, unknown extent | **Restore to the side**, validate, then point `DATABASE_URL` at it |

Don't roll forward without knowing when the bad write happened: pick the target from the side copy first.

### 5. Restore in place on the Coolify resource

1. Stop the `api` app, then the Postgres resource, in Coolify. Note the resource's container and volume names (`docker ps -a`, `docker volume ls`).
2. Run the restore against that volume, with the resource's own environment:

```bash
docker run --rm -v <volume>:/var/lib/postgresql "${REPO[@]}" --entrypoint pgbackrest "$IMAGE" \
  --stanza=clean-stack --delta --type=time "--target=<UTC time>" --target-action=promote restore
```

3. Start the resource; wait for `pg_is_in_recovery()` to answer `f`. Then `docker exec --user postgres <container> pgbackrest --stanza=clean-stack check`, and a full backup at once (`systemctl start clean-stack-pgbackrest@full.service`): the promotion opened a new timeline.
4. Start `api`; its migrator applies whatever the restored schema misses. Run the checks of section 3.

`--delta` reuses the files already on the volume and only fetches what differs, which keeps the RTO short on a large database.

## Drills

A backup never restored is a backup you don't know works.

- **Local**: `bash infra/pgbackrest/drill.sh` builds the image, starts a throwaway SeaweedFS behind a TLS proxy on an internal Docker network (pgBackRest speaks S3 over HTTPS only), creates the stanza, writes 1000 rows, takes a full backup, writes 500 more, notes the time, writes 700 more, then wipes the volume, restores to the noted time and expects 1500 rows. It never reads a real secret nor touches a real bucket. Last line: `drill passed: restored 1500 rows at <time>, RTO <n>s`.
- **Monthly in CI**: `pgbackrest-drill.yml` restores the latest state and a point 24 h back (or the `target` input) from the production repository into two scratch instances on the runner, with archiving off, then checks `select 1` and that `drizzle.__drizzle_migrations` is not empty. Its environment `pgbackrest-drill` holds the read-only key; the schedule runs only once `PGBACKREST_DRILL_ENABLED` is `true` (run it by hand first). A heartbeat URL pages you when it fails or stops running.

## Managed Postgres instead

If you don't self-host Postgres, skip pgBackRest and turn on the provider's PITR; test its restore the same way (to the side, then section 3).

- **Neon**: branch-based PITR built in. Restore = a branch from a point in time, then swap the connection string.
- **Supabase**: daily backups on Pro, PITR as an add-on.
- **AWS RDS**: automated backups on by default (7 to 35 d), `aws rds restore-db-instance-to-point-in-time`.
- **Fly.io Postgres**: daily volume snapshots; for PITR, attach a continuous backup target or move to a managed provider.
- **Other self-hosting**: pgBackRest as shipped here, [WAL-G](https://github.com/wal-g/wal-g) or Barman do the same job; keep one tool, not two.

## Optional, weekly logical export

A `pg_dump` is portable across Postgres majors and providers: it is what you use to leave a host, and a second copy outside R2. It is not a PITR. On the reference deploy CI cannot reach Postgres (tailnet only), so run it from the database host: in the Coolify Postgres resource's Backups tab, schedule `0 3 * * 0` to an S3 destination in another bucket than the pgBackRest one. With a reachable managed database, a GitHub Actions job does the same:

```yaml
name: Postgres weekly export
on:
  schedule:
    - cron: "0 3 * * 0"
  workflow_dispatch:
jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - name: Dump, compress, upload
        env:
          DATABASE_URL: ${{ secrets.EXPORT_DATABASE_URL }}
          S3_BUCKET: ${{ secrets.EXPORT_S3_BUCKET }}
          S3_ENDPOINT: ${{ secrets.EXPORT_S3_ENDPOINT }}
          AWS_ACCESS_KEY_ID: ${{ secrets.EXPORT_S3_KEY }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.EXPORT_S3_KEY_SECRET }}
          AWS_DEFAULT_REGION: auto
        run: |
          sudo apt-get update && sudo apt-get install -y postgresql-client
          KEY="postgres/$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz"
          pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip \
            | aws s3 cp - "s3://${S3_BUCKET}/${KEY}" --endpoint-url "$S3_ENDPOINT"
```

Use a read-only role for `EXPORT_DATABASE_URL`. Restore a dump into a fresh instance with `gunzip -c <file>.sql.gz | psql <url>`, then run section 3.

## Bucket rules and caveats

- **No lifecycle rule on the pgBackRest bucket.** pgBackRest expires backups and the WAL they need; a bucket rule that deletes by age removes WAL a kept backup still needs and breaks PITR silently. Lifecycle rules belong on the export bucket only.
- **Versioning or a bucket lock** protects against a stolen write key deleting everything. A lock shorter than the retention (for example 7 days) still lets `expire` work on older objects; check R2's current bucket lock rules before relying on it.
- **Postgres major upgrades** change the system id: after a `pg_upgrade` run `pgbackrest --stanza=clean-stack stanza-upgrade`; after a dump and reload into a new major, start a new repository path. The image pins one major on purpose; upgrading it is a planned operation, not an image bump.
- **The cipher passphrase cannot be rotated** on an existing repository: rotating means a new path, a new stanza and a full backup.
- **SeaweedFS** serves the local drill only; lifecycle and versioning support there is partial, so it proves the restore path, not the bucket rules.

## Sources

- [pgBackRest news](https://pgbackrest.org/news.html): maintenance handover (2026-04-27), revival by a sponsor group (2026-05-18), 2.60.0 (2026-10-18).
- [pgBackRest user guide](https://pgbackrest.org/user-guide.html): S3 repository, encryption, async archiving, PITR restore, `--delta`.
- [After pgBackRest, Christophe Pettus (April 2026)](https://thebuild.com/blog/2026/04/30/after-pgbackrest/): announces the pgxbackup fork.
- **SOC 2** Trust Services Criteria A.1 (availability, backup and recovery).
- **ISO 27001** Annex A 8.13 (information backup).

# Disaster recovery

> **TL;DR** — **activate PITR on your managed Postgres provider. That's your primary defense.** The weekly `pg_dump` export recipe below is for portable / anti-vendor-lock-in only, not your DR plan. clean-stack ships no backup code on purpose: every modern Postgres host does this better than a custom cron would, and `pgBackRest` lost its maintainer in 2026 — building on top of it would have been a regression.

This doc covers: RPO/RTO targets, the 3-2-1 rule applied to a clean-stack deployment, PITR setup per provider, the restore runbook, optional weekly portable export, optional monthly automated restore-test, lifecycle + versioning on the backup bucket, and known caveats.

## RPO / RTO targets

| Metric | With PITR (recommended) | With weekly `pg_dump` only (fallback) |
|---|---|---|
| **RPO** (max acceptable data loss) | 1–5 min (WAL replay) | up to 7 days |
| **RTO** (max acceptable downtime) | 1 h | 2–4 h (provision Postgres + restore dump + smoke) |

If your business can't tolerate a 24h+ data loss on prod, PITR isn't optional. For early-stage SaaS with a tiny user base, a daily provider snapshot + the weekly portable export is enough — just be honest about what you're committing to.

## 3-2-1 rule applied

| Copy | Where | Who manages it |
|---|---|---|
| **Live** | Your provider's primary Postgres | Provider (replicated automatically on Neon/Supabase/RDS) |
| **PITR / daily snapshot** | Same provider, separate storage tier | Provider (continuous WAL or daily snapshots, retention 7–35 d) |
| **Weekly portable export** | Your S3-compatible bucket (R2 / SeaweedFS / S3), preferably **different region** | You (the recipe below) |

Provider PITR + provider snapshot count as one logical copy (same blast radius if the provider account is compromised or terminated). The weekly portable export is what survives "the provider deleted my account by mistake" or "I want to leave this vendor".

## PITR setup per provider

Short pointers only — every provider's UI changes faster than docs. Search "PITR" in your dashboard.

- **Railway** — Pro plan ships daily backups by default. PITR is an add-on; enable it on the Postgres service settings. Restore via the dashboard or the Railway CLI.
- **Neon** — branch-based PITR is built-in (sub-second granularity on Scale+). Restore = create a new branch from a point in time, swap the connection string. CLI: `neon branches restore`.
- **Supabase** — daily automated backups (Pro). PITR is an add-on (Pro+) with up to 7 d granularity. Restore via the dashboard.
- **AWS RDS** — automated backups on by default (7 d retention, up to 35 d). PITR sub-minute granularity. Restore via `aws rds restore-db-instance-to-point-in-time`.
- **Fly.io Postgres** — daily volume snapshots (5 d retention). For PITR, attach a continuous backup target (S3 via `fly pg backup`) or migrate to a managed provider.
- **Self-hosted Postgres** — point to [WAL-G](https://github.com/wal-g/wal-g) (sidecar, S3-compatible, well-suited to Kubernetes and Docker Compose). Notice: [pgBackRest is unmaintained since 2026](https://thebuild.com/blog/2026/04/30/after-pgbackrest/) — don't start new projects on it. Barman (EDB-backed) is the alternative for multi-cluster ops.

Whichever you pick, **test the restore** before you need it (see § Restore runbook below).

## Restore runbook

The runbook assumes the dump is a plain SQL `*.sql.gz` produced by the export recipe in the next section. Adapt the commands for `pg_restore` if you switch to `--format=custom`.

### 1. Provision an ephemeral target

Don't restore over the live DB until you've verified the dump on a sandbox first.

```bash
docker run --rm -d \
  --name pg-restore-test \
  -p 5436:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres \
  postgres:17-alpine
```

### 2. Download the dump

```bash
aws s3 cp \
  "s3://${S3_BUCKET}/backups/postgres/<YYYY-MM-DDTHHMMSSZ>.sql.gz" \
  ./latest.sql.gz \
  --endpoint-url "$S3_ENDPOINT"
```

For PITR restores, this step doesn't apply — use the provider console / CLI; the runbook resumes at step 4.

### 3. Restore

```bash
gunzip -c latest.sql.gz \
  | psql -h localhost -p 5436 -U postgres -d postgres
```

Expect a flood of `CREATE TABLE` / `COPY` / `ALTER TABLE`. `NOTICE` lines about already-present extensions are fine; `ERROR` lines are not — abort and investigate.

### 4. Verify

Sanity check: every table has the row counts you'd expect. Inline 15-line smoke script — drop in `apps/api/scripts/db-smoke.ts` if you want to keep it (clean-stack doesn't ship it by default, infra-specific):

```ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "@packages/drizzle";
import { sql } from "drizzle-orm";

const db = drizzle(postgres(process.env.DATABASE_URL!), { schema });
const tables = ["user", "session", "organization", "member", "outbox_event", "audit_log", "webhook_delivery"];
for (const t of tables) {
  const [{ count }] = await db.execute<{ count: number }>(sql`select count(*)::int as count from ${sql.identifier(t)}`);
  console.log(JSON.stringify({ table: t, count }));
}
process.exit(0);
```

Run it against the restored DB:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5436/postgres \
  bun run db-smoke.ts
```

Any row of `{ count: 0 }` on a table you expect data in = corrupted dump or wrong source. Stop. Investigate before doing anything to the live DB.

### 5. Decide: roll forward, restore in place, or restore to side

| Situation | Action |
|---|---|
| Data corruption isolated, recent (≤ minutes), no schema damage | **Roll forward** via PITR to just before the bad write |
| Data corruption widespread or old, schema intact | **Restore in place** to the most recent good backup, replay business events since via the outbox if possible |
| Schema corruption, ransomware, account compromise | **Restore to side** (new instance), validate, then cut over DNS/connection-strings |

Don't roll forward if you don't know exactly when the bad write happened. Don't restore in place if you haven't first validated on the side instance.

## Optional — weekly portable export

The recipes below produce one `*.sql.gz` per week in `backups/postgres/<ISO-timestamp>.sql.gz`. They're a fallback against vendor lock-in or provider account loss — not your primary DR. Pick **one** scheduler.

### GitHub Actions

```yaml
# .github/workflows/postgres-export.yml
name: Postgres weekly export
on:
  schedule:
    - cron: "0 3 * * 0"   # Sunday 03:00 UTC
  workflow_dispatch:
jobs:
  export:
    runs-on: ubuntu-latest
    steps:
      - name: Install postgresql-client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - name: Dump → gzip → S3
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          S3_BUCKET: ${{ secrets.S3_BUCKET }}
          S3_ENDPOINT: ${{ secrets.S3_ENDPOINT }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          KEY="backups/postgres/$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz"
          pg_dump --no-owner --no-privileges "$DATABASE_URL" \
            | gzip \
            | aws s3 cp - "s3://${S3_BUCKET}/${KEY}" --endpoint-url "$S3_ENDPOINT"
          echo "key=$KEY" >> "$GITHUB_OUTPUT"
```

Set `secrets.DATABASE_URL` to a **read-only** Postgres role (`GRANT CONNECT, USAGE, SELECT` on the relevant schemas) — `pg_dump` doesn't need superuser, and a leaked CI secret should not be able to write.

### Railway Cron (same project as the API)

```jsonc
// railway.json (cron service — separate from the API service)
{
  "deploy": {
    "startCommand": "bash -c 'pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://$S3_BUCKET/backups/postgres/$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz --endpoint-url $S3_ENDPOINT'",
    "cronSchedule": "0 3 * * 0"
  }
}
```

The cron service needs the `postgresql-client` package (Nixpacks: add `postgresql_17` to `nixpacks.toml`) and AWS CLI. Same env vars as above.

### Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata: { name: postgres-export }
spec:
  schedule: "0 3 * * 0"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: dump
              image: postgres:17-alpine
              command: ["sh", "-c"]
              args:
                - |
                  apk add --no-cache aws-cli
                  KEY="backups/postgres/$(date -u +%Y-%m-%dT%H%M%SZ).sql.gz"
                  pg_dump --no-owner --no-privileges "$DATABASE_URL" \
                    | gzip \
                    | aws s3 cp - "s3://${S3_BUCKET}/${KEY}" --endpoint-url "$S3_ENDPOINT"
              envFrom: [{ secretRef: { name: postgres-export } }]
```

## Optional — monthly automated restore-test

A backup that's never restored is a backup you don't know works. This recipe restores the latest dump to an ephemeral Postgres and fails loudly if it can't.

```yaml
# .github/workflows/postgres-restore-test.yml
name: Postgres restore-test
on:
  schedule:
    - cron: "0 4 1 * *"   # 1st of each month, 04:00 UTC
  workflow_dispatch:
jobs:
  restore-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: postgres }
        ports: ["5436:5432"]
        options: --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - name: Install postgresql-client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - name: Download latest dump
        env:
          S3_BUCKET: ${{ secrets.S3_BUCKET }}
          S3_ENDPOINT: ${{ secrets.S3_ENDPOINT }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: auto
        run: |
          LATEST=$(aws s3 ls "s3://${S3_BUCKET}/backups/postgres/" --endpoint-url "$S3_ENDPOINT" \
            | sort | tail -n1 | awk '{print $4}')
          aws s3 cp "s3://${S3_BUCKET}/backups/postgres/${LATEST}" ./latest.sql.gz \
            --endpoint-url "$S3_ENDPOINT"
      - name: Restore
        run: gunzip -c latest.sql.gz | psql -h localhost -p 5436 -U postgres -d postgres
      - name: Smoke check (every table has rows)
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5436/postgres
        run: |
          for t in user session organization member outbox_event audit_log; do
            COUNT=$(psql "$DATABASE_URL" -tAc "select count(*) from \"$t\"")
            echo "{\"table\":\"$t\",\"count\":$COUNT}"
            [ "$COUNT" -ge 0 ] || exit 1
          done
```

If this job fails, page someone. A green job a month is a thin signal — a red job after weeks of green is the only thing standing between you and a real outage.

## Backup bucket — lifecycle + versioning

S3-compatible buckets (R2, SeaweedFS, AWS S3) all support lifecycle rules and versioning, with subtle differences. Below = AWS-flavoured CLI; adapt the endpoint for R2 or SeaweedFS.

### Lifecycle — expire dailies, keep monthlies

This rule expires anything older than 30 days under `backups/postgres/` and transitions monthly snapshots (under `backups/postgres-monthly/`) to a cold-storage class after 30 days, keeping them 1 year. Re-target the prefix paths for your layout.

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$S3_BUCKET" \
  --endpoint-url "$S3_ENDPOINT" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "expire-weekly-exports-30d",
        "Status": "Enabled",
        "Filter": { "Prefix": "backups/postgres/" },
        "Expiration": { "Days": 30 }
      },
      {
        "ID": "monthly-to-cold-1y",
        "Status": "Enabled",
        "Filter": { "Prefix": "backups/postgres-monthly/" },
        "Transitions": [{ "Days": 30, "StorageClass": "GLACIER" }],
        "Expiration": { "Days": 365 }
      }
    ]
  }'
```

### Versioning + delete protection

Enable versioning so an accidental `aws s3 rm` doesn't permanently destroy the latest backup:

```bash
aws s3api put-bucket-versioning \
  --bucket "$S3_BUCKET" \
  --endpoint-url "$S3_ENDPOINT" \
  --versioning-configuration Status=Enabled
```

For production: enable **MFA delete** (AWS S3 only, not R2/SeaweedFS) — requires a TOTP factor on every permanent delete.

### Caveats

- **Cloudflare R2** — no GLACIER class. Use **Infrequent Access** (`StorageClass: STANDARD_IA`) instead, or accept that monthly snapshots cost the same as dailies. R2 lifecycle support is more limited than AWS S3; check current capability before relying on transition rules.
- **SeaweedFS** — lifecycle rules and versioning are partially supported depending on version. Treat the snippets above as production guidance; locally, focus on the dump path itself, not the lifecycle.

## Sources

- [After pgBackRest — Christophe Pettus (April 2026)](https://thebuild.com/blog/2026/04/30/after-pgbackrest/) — why the tool is unmaintained and what to migrate to.
- [Set up PostgreSQL backups with WAL-G on Kubernetes (Feb 2026)](https://oneuptime.com/blog/post/2026-02-09-postgresql-backups-walg-kubernetes/view) — sidecar pattern for self-hosted.
- [Best PostgreSQL hosting in 2026: RDS vs Supabase vs Neon vs Self-hosted](https://dev.to/philip_mcclarence_2ef9475/best-postgresql-hosting-in-2026-rds-vs-supabase-vs-neon-vs-self-hosted-5fkp) — provider PITR comparison.
- [Why you don't need PITR for most Postgres DBs in 2026](https://medium.com/@pawale7663/why-you-dont-need-pitr-and-incremental-backups-for-most-postgresql-databases-in-2026-b2a1f3ec6833) — counterpoint, RPO-honesty perspective.
- **SOC 2** Trust Services Criteria § A.1 (Availability — backup + recovery).
- **ISO 27001** Annex A § A.12.3 (Backup).

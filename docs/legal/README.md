# Legal Templates

Contractual templates to be sent to clients before or alongside the service agreement. Fill all placeholders before execution — see checklist below.

---

## When to use which template

| Client type | Send |
|---|---|
| EU client, non-financial sector | [DPA-template.md](./DPA-template.md) |
| EU client, fintech / insurance | [DPA-template.md](./DPA-template.md) + [DORA-annex-template.md](./DORA-annex-template.md) |
| Non-EU client | [DPA-template.md](./DPA-template.md) (optional but recommended) |

---

## Templates

- **[DPA-template.md](./DPA-template.md)** — Data Processing Agreement (GDPR Art. 28), 12 clauses.
- **[DORA-annex-template.md](./DORA-annex-template.md)** — ICT Service Provider Annex (DORA Art. 30, in force 17 Jan 2025), 11 provisions.

---

## Sub-processor list

The canonical sub-processor list is maintained at `/legal/sub-processors` (front-end page). The DPA Annex I ("Security Measures") and sub-processor authorization clause (DPA Clause 7) both reference this page as the authoritative disclosure. Do not maintain a parallel list elsewhere.

---

## Placeholders to wire before production

All `[PLACEHOLDER]` tokens across both templates — plus placeholders present in the front-end legal pages — must be replaced with real values before any document is sent to a client or published live.

### From DPA-template.md

| Placeholder | Where used | Notes |
|---|---|---|
| `[CLIENT_NAME]` | DPA header, throughout | Full legal name of the Controller |
| `[EFFECTIVE_DATE]` | DPA Clause 2 | Date DPA enters into force |
| `[CONTRACT_END_DATE]` | DPA Clause 2 | Scheduled end of Principal Agreement |
| `[DATA_LOCATION]` | DPA Clause 9 | Country/region of processing and storage |
| `[CONTROLLER_JURISDICTION]` | DPA header | Country of incorporation of the Controller |
| `[DPO_EMAIL]` | DPA Clause 7 | Notification email for sub-processor changes |
| `[COMPANY_NAME]` | DPA header, throughout | Full legal name of the Processor |
| `[COMPANY_JURISDICTION]` | DPA header | Country of incorporation of the Processor |

### From DORA-annex-template.md

| Placeholder | Where used | Notes |
|---|---|---|
| `[SERVICE_DESCRIPTION]` | DORA Clause 1 | Precise ICT function description |
| `[DATA_LOCATION_PROCESSING]` | DORA Clause 2 | Country/region of active processing |
| `[DATA_LOCATION_STORAGE]` | DORA Clause 2 | Country/region of storage at rest |
| `[DATACENTER_PRIMARY]` | DORA Clause 2 | Primary datacenter name/location |
| `[DATACENTER_DR]` | DORA Clause 2 | Disaster recovery site name/location |
| `[ISOLATION_TIER]` | DORA Clause 3 | Tenant isolation model (logical/physical/crypto) |
| `[RETENTION_PERIOD]` | DORA Clause 3 | Post-termination data retention period |
| `[SLA_AVAILABILITY]` | DORA Clause 4 | Monthly availability target (e.g., 99.9%) |
| `[RPO]` | DORA Clause 4 | Recovery Point Objective — align with `docs/DISASTER-RECOVERY.md` |
| `[RTO]` | DORA Clause 4 | Recovery Time Objective — align with `docs/DISASTER-RECOVERY.md` |
| `[LATENCY_THRESHOLD]` | DORA Clause 4 | p99 latency threshold in ms |
| `[ERROR_RATE_THRESHOLD]` | DORA Clause 4 | Error rate % triggering degraded state |
| `[STATUS_PAGE_URL]` | DORA Clause 4 | URL of public or customer-facing status page |
| `[SLA_CREDITS_SCHEDULE]` | DORA Clause 4 | Section reference for service credits in Principal Agreement |
| `[MAX_CRITICAL_SUBCONTRACTORS]` | DORA Clause 6 | Max critical sub-contractors without prior consent |
| `[CONCENTRATION_GEOGRAPHY]` | DORA Clause 6 | Geographic concentration of critical infrastructure |
| `[TERMINATION_NOTICE_PERIOD]` | DORA Clause 7 | Standard termination notice in days |
| `[MAX_OUTAGE_HOURS]` | DORA Clause 7 | Continuous outage threshold triggering termination right |
| `[EXPORT_FORMAT]` | DORA Clause 8 | Data export format(s) supported |
| `[EXPORT_DELIVERY_DAYS]` | DORA Clause 8 | Days to deliver export after portability request |
| `[INCIDENT_CONTACT_EMAIL]` | DORA Clause 9 | 24/7 incident notification email |
| `[CLOUD_PROVIDER_DISCLOSURE]` | DORA Clause 10 | Hyperscale/critical infrastructure dependencies |
| `[ALTERNATIVE_PROVIDER_DESCRIPTION]` | DORA Clause 10 | Contingency alternative provider description |
| `[AVAILABILITY_ZONES]` | DORA Clause 10 | Number of availability zones |
| `[NUMBER_OF_REGIONS]` | DORA Clause 10 | Number of geographic regions in deployment |
| `[INSURANCE_AMOUNT]` | DORA Clause 11 | Minimum cyber liability insurance coverage |
| `[PI_INSURANCE_AMOUNT]` | DORA Clause 11 | Minimum professional indemnity coverage |

### From front-end legal pages (wire before going live)

| Placeholder | Page | Regulatory basis | Notes |
|---|---|---|---|
| `accessibility@[domain]` | `/legal/accessibility` | EAA Art. 14 — accessibility contact channel is mandatory | Replace `[domain]` with the real service domain (e.g., `accessibility@example.com`) |
| `dpo@[domain]` | `/legal/sub-processors` | GDPR Art. 28§2 — DPA sub-processor change notifications | Replace `[domain]` with the real domain; must match `[DPO_EMAIL]` in the DPA |
| National accessibility authority | `/legal/accessibility` | EAA / national transposition | Name the relevant authority for the jurisdiction (e.g., ARCOM in France); update before launch in each target market |

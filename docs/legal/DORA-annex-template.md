# ICT Service Provider Contractual Annex — DORA Article 30

This annex ("DORA Annex") is entered into between **[CLIENT_NAME]** ("Financial Entity") and **[COMPANY_NAME]** ("ICT Third-Party Service Provider") and forms a mandatory supplement to the ICT service agreement ("Principal Agreement") dated **[EFFECTIVE_DATE]**. It is issued pursuant to Article 30 of Regulation (EU) 2022/2554 on digital operational resilience for the financial sector ("DORA"), applicable from 17 January 2025.

---

## 1. Service Description

The ICT Third-Party Service Provider delivers the following services and ICT functions to the Financial Entity:

**[SERVICE_DESCRIPTION]** — a SaaS platform providing [describe core functions, e.g., "multi-tenant application infrastructure, identity management, and data processing APIs"].

**Classification:** The services described herein are classified as **[critical / important / other]** ICT functions within the meaning of Article 3(22) DORA, as assessed by the Financial Entity pursuant to its ICT risk management framework under Article 6 DORA.

The ICT Third-Party Service Provider acknowledges this classification and agrees to maintain the service standards and contractual obligations commensurate with that classification throughout the term of the Principal Agreement.

---

## 2. Data Locations

**Processing locations:** Personal and operational data is processed in **[DATA_LOCATION_PROCESSING]** (country/region).

**Storage locations:** Data at rest is stored in **[DATA_LOCATION_STORAGE]** (country/region). Primary datacenter: **[DATACENTER_PRIMARY]**. Disaster recovery site: **[DATACENTER_DR]**.

The ICT Third-Party Service Provider shall notify the Financial Entity in writing at least **30 days** before any change to data processing or storage locations. Relocation to a non-EU/EEA country requires prior written consent from the Financial Entity and compliance with applicable data transfer requirements under GDPR.

---

## 3. Data Provisions

**Categories of data processed:** [List: e.g., transactional data, user credentials, audit logs, financial transaction metadata].

**Access controls:** Access to Financial Entity data is restricted on a need-to-know basis enforced by role-based access control (RBAC). Privileged access requires multi-factor authentication and is logged.

**Encryption:**
- At rest: AES-256 or equivalent.
- In transit: TLS 1.2 minimum; TLS 1.3 preferred.

**Tenant isolation:** Financial Entity data is logically isolated from other customers through [describe mechanism: e.g., "per-tenant database schemas, row-level security, and namespace separation"]. Physical or cryptographic isolation is provided where specified in **[ISOLATION_TIER]**.

**Data retention and deletion:** Data is retained for **[RETENTION_PERIOD]** following termination of the service, after which secure deletion is performed and certified in writing.

---

## 4. Service Levels / SLA

**Availability target:** **[SLA_AVAILABILITY]** (e.g., 99.9%) measured on a monthly calendar basis, excluding planned maintenance windows notified at least 72 hours in advance.

**Recovery objectives:**
- Recovery Point Objective (RPO): **[RPO]** — aligned with `docs/DISASTER-RECOVERY.md` Phase 0.3.
- Recovery Time Objective (RTO): **[RTO]** — aligned with `docs/DISASTER-RECOVERY.md` Phase 0.3.

**Degradation thresholds:** Service is considered degraded when response latency exceeds **[LATENCY_THRESHOLD]** ms (p99) or error rate exceeds **[ERROR_RATE_THRESHOLD]**% over a rolling 5-minute window.

**Measurement methodology:** Availability is calculated as: `(Total minutes in month − minutes of unplanned downtime) / Total minutes in month × 100`. Downtime begins at confirmed incident declaration and ends at confirmed resolution. Measurement data is available to the Financial Entity via **[STATUS_PAGE_URL]**.

**Remedies:** SLA breaches entitle the Financial Entity to service credits as specified in **[SLA_CREDITS_SCHEDULE]** of the Principal Agreement.

---

## 5. Audit Rights

The Financial Entity (and, where required by competent authority, supervisory authorities and designated third-party auditors) has the right to conduct audits and inspections of the ICT Third-Party Service Provider's premises, systems, and documentation, subject to:

a. **Prior written notice** of at least **30 days**, specifying scope, dates, methodology, and identity of auditors.

b. Audits may be conducted **on-site**, **remotely**, or through **independent third-party assessors** mandated by the Financial Entity.

c. The ICT Third-Party Service Provider shall share, upon request: (i) results of penetration tests conducted within the preceding 12 months; (ii) ISO 27001 / SOC 2 Type II certifications or equivalent in scope; (iii) relevant excerpts from business continuity and disaster recovery test reports.

d. Audits are limited to **once per calendar year** unless a competent authority requires more frequent assessment, or a substantiated incident or breach warrants additional review.

e. Supervisory authority inspections under Article 38–44 DORA are not subject to frequency limits and override any contractual restrictions.

---

## 6. Sub-contracting and Concentration

**Critical sub-contractors:** The ICT Third-Party Service Provider currently relies on the following sub-contractors for the delivery of critical or important functions: see current list at `/legal/sub-processors`.

**Notification obligation:** The ICT Third-Party Service Provider shall notify the Financial Entity in writing at least **30 days** before adding, replacing, or materially changing a sub-contractor supporting critical or important functions. The Financial Entity reserves the right to object within **15 days** of notification.

**Sub-contractor limit:** The total number of sub-contractors supporting critical functions shall not exceed **[MAX_CRITICAL_SUBCONTRACTORS]** without prior written consent from the Financial Entity.

**Geographic concentration:** The ICT Third-Party Service Provider discloses that its critical infrastructure is concentrated in **[CONCENTRATION_GEOGRAPHY]**. Identified concentration risks and mitigations are described in the Business Continuity Plan shared under Clause 5.

---

## 7. Termination Conditions

The Financial Entity may terminate this Annex (and, where applicable, the Principal Agreement) with immediate effect or on **[TERMINATION_NOTICE_PERIOD]** days' written notice upon occurrence of any of the following:

a. Material breach of this DORA Annex not remediated within **30 days** of written notice.

b. Insolvency, liquidation, or appointment of an administrator or receiver over the ICT Third-Party Service Provider.

c. An order or direction by a competent supervisory authority (including under Article 42 DORA) requiring termination.

d. A continuous service outage exceeding **[MAX_OUTAGE_HOURS]** hours that breaches recovery objectives in Clause 4.

e. Material change to the sub-contractor structure (Clause 6) that the Financial Entity reasonably determines increases operational risk beyond acceptable thresholds.

The right to terminate does not waive any accrued claims, and service continuity obligations under Clause 8 survive termination.

---

## 8. Exit Plan and Reversibility

**Transition assistance:** The ICT Third-Party Service Provider shall provide exit assistance for a minimum of **12 months** following notice of termination, including access to data, documentation, and reasonable technical support to facilitate migration to an alternative provider.

**Data portability:** All Financial Entity data shall be made available for export in **[EXPORT_FORMAT]** (e.g., CSV, JSON, PostgreSQL dump) within **[EXPORT_DELIVERY_DAYS]** days of a portability request or termination notice.

**Deletion certification:** Following confirmed export and written release by the Financial Entity, the ICT Third-Party Service Provider shall securely delete all copies of Financial Entity data and deliver a written certificate of deletion within **30 days**, describing the deletion method applied.

**Migration support:** The ICT Third-Party Service Provider shall not intentionally hinder migration and shall, on request, cooperate with the Financial Entity's replacement provider under a data access protocol agreed in good faith.

---

## 9. Incident Management

**Initial notification:** The ICT Third-Party Service Provider shall notify the Financial Entity of any major ICT-related incident (within the meaning of Article 18 DORA) within **4 hours** of becoming aware of the incident, using the contact: **[INCIDENT_CONTACT_EMAIL]**.

**Detailed report:** A detailed incident report shall be provided within **24 hours** of the initial notification, covering: nature, scope, affected systems, number of impacted users, root cause hypothesis, and immediate remediation steps taken.

**Final report:** A post-incident root-cause analysis and full timeline shall be delivered within **1 month** of incident resolution.

**Classification alignment:** Incident severity classification follows the NIS2 Directive thresholds (as incorporated into DORA Article 18(1)), applied by reference to the Financial Entity's internal ICT risk taxonomy where shared in writing.

**Regulatory reporting:** The ICT Third-Party Service Provider shall cooperate with the Financial Entity to provide any documentation required for the Financial Entity's own reporting obligations to competent authorities under Article 19 DORA.

---

## 10. Concentration Risk Acknowledgment

The ICT Third-Party Service Provider acknowledges that it may constitute a concentrated exposure for the Financial Entity and relevant supervisory authorities within the meaning of DORA Chapter V.

**Market concentration:** The ICT Third-Party Service Provider discloses that its underlying infrastructure depends in part on **[CLOUD_PROVIDER_DISCLOSURE]** (e.g., "major hyperscale cloud providers operating in the EU"). This dependency is disclosed to enable the Financial Entity to assess its own concentration risk register.

**Alternative provider:** The Financial Entity has identified **[ALTERNATIVE_PROVIDER_DESCRIPTION]** as a contingency alternative capable of providing equivalent critical functions. The ICT Third-Party Service Provider agrees to provide reasonable cooperation to facilitate migration to this alternative if required.

**Geographic concentration mitigations:** Infrastructure is distributed across **[AVAILABILITY_ZONES]** availability zones in **[NUMBER_OF_REGIONS]** regions. Cross-region failover is automated for critical functions with RTO as stated in Clause 4.

---

## 11. Insurance and Financial Resilience

The ICT Third-Party Service Provider maintains and shall maintain throughout the term of the Principal Agreement:

a. **Cyber liability insurance** with a minimum coverage of **[INSURANCE_AMOUNT]** per occurrence and in aggregate, covering: data breach, business interruption, regulatory fines (where insurable), and third-party liability arising from ICT incidents.

b. **Professional indemnity (errors and omissions) insurance** with coverage not less than **[PI_INSURANCE_AMOUNT]** per claim, addressing liability arising from the performance of ICT services.

c. The ICT Third-Party Service Provider shall provide the Financial Entity with **annual proof of insurance coverage** (certificate of insurance or equivalent), and shall notify the Financial Entity within **10 business days** of any material reduction, cancellation, or lapse in coverage.

---

## Placeholders

The following placeholders must be replaced before this Annex is executed:

| Placeholder | Description |
|---|---|
| `[CLIENT_NAME]` | Full legal name of the Financial Entity |
| `[COMPANY_NAME]` | Full legal name of the ICT Third-Party Service Provider |
| `[EFFECTIVE_DATE]` | Date this Annex enters into force |
| `[SERVICE_DESCRIPTION]` | Precise description of ICT services and functions covered |
| `[DATA_LOCATION_PROCESSING]` | Country/region where data is actively processed |
| `[DATA_LOCATION_STORAGE]` | Country/region where data at rest is stored |
| `[DATACENTER_PRIMARY]` | Name/location of the primary datacenter |
| `[DATACENTER_DR]` | Name/location of the disaster recovery site |
| `[ISOLATION_TIER]` | Isolation model (logical / physical / cryptographic) applicable to this contract |
| `[RETENTION_PERIOD]` | Post-termination data retention period |
| `[SLA_AVAILABILITY]` | Monthly availability target (e.g., 99.9%) |
| `[RPO]` | Recovery Point Objective (e.g., "1 hour") |
| `[RTO]` | Recovery Time Objective (e.g., "4 hours") |
| `[LATENCY_THRESHOLD]` | p99 latency threshold in ms triggering degraded state |
| `[ERROR_RATE_THRESHOLD]` | Error rate % threshold triggering degraded state |
| `[STATUS_PAGE_URL]` | URL of the public or customer-facing status page |
| `[SLA_CREDITS_SCHEDULE]` | Section reference within the Principal Agreement for service credit terms |
| `[MAX_CRITICAL_SUBCONTRACTORS]` | Maximum number of critical sub-contractors permitted without prior consent |
| `[CONCENTRATION_GEOGRAPHY]` | Geographic region(s) where critical infrastructure is concentrated |
| `[TERMINATION_NOTICE_PERIOD]` | Standard termination notice period in days |
| `[MAX_OUTAGE_HOURS]` | Maximum continuous outage (hours) triggering termination right |
| `[EXPORT_FORMAT]` | Data export format(s) supported |
| `[EXPORT_DELIVERY_DAYS]` | Days to deliver exported data after portability request |
| `[INCIDENT_CONTACT_EMAIL]` | 24/7 incident notification email or escalation path |
| `[CLOUD_PROVIDER_DISCLOSURE]` | Disclosure of hyperscale or critical infrastructure dependencies |
| `[ALTERNATIVE_PROVIDER_DESCRIPTION]` | Description of identified alternative provider for contingency |
| `[AVAILABILITY_ZONES]` | Number of availability zones used for distribution |
| `[NUMBER_OF_REGIONS]` | Number of geographic regions in deployment |
| `[INSURANCE_AMOUNT]` | Minimum cyber liability insurance coverage (currency + amount) |
| `[PI_INSURANCE_AMOUNT]` | Minimum professional indemnity insurance coverage |

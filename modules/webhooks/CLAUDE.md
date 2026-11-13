# webhooks module rules

Organization webhook endpoints, the fan-out of public catalog events into deliveries, and the signed delivery worker. Auto-loaded under `modules/webhooks/`; module contract: `modules/CLAUDE.md`; lease model shared with the other delivery workers: `packages/outbox/CLAUDE.md` rule 5.

## Invariants

1. **An endpoint secret is sealed with XChaCha20-Poly1305 under a per organization sub key** (HKDF-SHA256 of the master key, info `webhook-secret:<organizationId>`), and its plaintext is returned once, on create and on rotate. **Why**: one organization's key material exposes no other, and a database read yields no usable secret.
2. **A missing master key never stops the module from booting**: create and rotate return `WEBHOOK_MASTER_KEY_UNAVAILABLE`, and a delivery fails as retryable until the key is set. **Why**: the rest of the api keeps serving while one optional feature is unconfigured.
3. **Rotation keeps the previous secret valid for `secretGraceHours`**: a delivery signs with every live secret, header `t=<ts>,v1=<hex>[,v1=<hex>]` over `<ts>.<body>`. **Why**: a receiver can roll its secret without dropping a delivery.
4. **The URL guard runs at create, at update and again before every delivery.** It refuses a non https scheme when `httpsOnly`, credentials in the URL, and any destination whose resolved addresses include a private or reserved one (an IPv4 mapped IPv6 address is unwrapped first). A DNS lookup timeout is retryable (`WEBHOOK_HOST_LOOKUP_TIMEOUT`); a forbidden destination is terminal and no request is sent. **Why**: DNS can change between create and send, so a check at create time alone is no protection. A delivery never follows a redirect: a 3xx is a failed, retried delivery with its status and headers recorded. **Why**: the guard checks only the endpoint URL, so a followed `Location` would carry the signed payload to an internal address.
5. **Every endpoint read or write made for a member carries `organizationId` in the repository `WHERE`**; only the worker reads an endpoint by id alone. **Why**: ownership lives in the query, a wrong organization reads as absent.
6. **Fan-out reacts only to public catalog events that carry an organization**, writing one `webhook_delivery` per matching enabled endpoint with key `<eventId>:<endpointId>` and `ON CONFLICT DO NOTHING`.
7. **Delivery specifics on top of the shared lease model**: 4 attempts then `dead_letter`; the lease must cover the DNS timeout plus the fetch timeout per delivery, plus the settle margin (`application/config/webhook-settings.ts`), proven by `check:webhook-lease`.
8. **On the first death (announced as in `packages/outbox/CLAUDE.md` rule 5)** the endpoint failure counter is bumped, and the endpoint is disabled (`WEBHOOK_ENDPOINT_DISABLED`) only when it reached `autoDisableMinFailures` consecutive failures AND its first failure is older than `autoDisableAfterDays`. A success resets the counter. **Why**: one bad hour must not disable an endpoint that works the rest of the week.

## Events emitted

- `WEBHOOK_ENDPOINT_CREATED`, `WEBHOOK_ENDPOINT_UPDATED`, `WEBHOOK_ENDPOINT_DELETED`, `WEBHOOK_ENDPOINT_SECRET_ROTATED`, `WEBHOOK_DELIVERY_REPLAYED`, `WEBHOOK_TEST`: the acting member is `actorUserId`.
- `WEBHOOK_DELIVERY_EXHAUSTED`, `WEBHOOK_ENDPOINT_DISABLED`: `actorUserId: null`, the worker decides alone.
- A test delivery is sent right after create; its failure is logged, never returned to the caller.

## Traps

- `isStaleTimestamp` in `infra/adapters/hmac-signer.adapter.ts` is the receiver side check (300 s tolerance); the module never calls it, keep it in step with the signature format if that format changes.

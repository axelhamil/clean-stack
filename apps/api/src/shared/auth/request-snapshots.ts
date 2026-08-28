/**
 * A value captured in `hooks.before` for a consumer that runs later in the *same*
 * request — the read-before-write pattern the BetterAuth hooks need when the data
 * a `hooks.after` (or an organization hook) has to emit is gone, or was never
 * visible, by the time it runs.
 *
 * The store is module-global, not request-scoped, which is the whole hazard: a
 * `before` hook fires for every matching request, but its consumer does not. The
 * endpoint can 404, the plugin can skip the hook, the response can be an
 * `APIError` — and the entry is then stranded under a key a *later, unrelated*
 * request may present. A stranded entry that silently attaches to that request is
 * not a leak, it is fabricated provenance on an audit event.
 *
 * Two independent guards close that, and both are required:
 *
 * - **Freshness** bounds how long a stranded entry can be picked up at all. A
 *   snapshot is only ever consumed by the request that took it, and that request
 *   is measured in milliseconds; anything older is evidence the taker died.
 * - **The consumer's own match check** (`accepts`) decides whether the entry
 *   belongs to it — an organization id, a path, whatever second identity the
 *   consumer holds and the key does not carry. A bare key is not proof of
 *   provenance when anyone can choose the key.
 *
 * A non-matching entry is deliberately left in place: it may still belong to a
 * request in flight. Stale entries are dropped on read and swept on write, so the
 * map cannot grow past the snapshots actually in flight.
 */
export class RequestSnapshots<T> {
  private readonly entries = new Map<string, { value: T; at: number }>();

  constructor(private readonly ttlMs: number) {}

  set(key: string, value: T): void {
    this.sweep();
    this.entries.set(key, { value, at: Date.now() });
  }

  /**
   * Returns the snapshot only if it is fresh and `accepts` it, removing it in that
   * case. A stale entry is dropped and never returned; a fresh one the consumer
   * rejects is left for its own consumer.
   */
  take(key: string, accepts?: (value: T) => boolean): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    if (accepts && !accepts(entry.value)) return undefined;
    this.entries.delete(key);
    return entry.value;
  }

  private sweep(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [key, entry] of this.entries) {
      if (entry.at < cutoff) this.entries.delete(key);
    }
  }
}

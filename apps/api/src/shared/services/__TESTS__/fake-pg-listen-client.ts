import type { PgListenClient } from "../pg-listener";

type Handler = (arg?: unknown) => void;

/**
 * Mimics the only two `pg` behaviours a listener depends on: a dead connection
 * emits `error` *and* `end`, and a client keeps relaying `notification` until
 * its listeners are removed. Everything else is a stub.
 */
export class FakePgListenClient implements PgListenClient {
  readonly handlers = new Map<string, Handler[]>();
  ended = false;
  listening = false;
  connectRejects = false;
  private connectGate: Promise<void> | null = null;
  private releaseConnectGate: (() => void) | null = null;

  on(event: string, listener: Handler): this {
    const existing = this.handlers.get(event) ?? [];
    existing.push(listener);
    this.handlers.set(event, existing);
    return this;
  }

  /**
   * Makes this client's `connect()` hang until `releaseConnect()` is called.
   * Lets a test land an `error` (and the `end` that follows it) while
   * `connect()` is still in flight, deterministically instead of racing on
   * timing, to exercise the `disposed.has(client)` re-check that guards
   * against adopting a client that died mid-connect.
   */
  suspendConnect(): void {
    this.connectGate = new Promise((resolve) => {
      this.releaseConnectGate = resolve;
    });
  }

  releaseConnect(): void {
    this.releaseConnectGate?.();
  }

  async connect(): Promise<void> {
    if (this.connectGate) await this.connectGate;
    if (this.connectRejects) throw new Error("connect refused");
  }

  async query(_text: string): Promise<unknown> {
    this.listening = true;
    return {};
  }

  async end(): Promise<void> {
    this.ended = true;
  }

  removeAllListeners(): this {
    this.handlers.clear();
    return this;
  }

  private emit(event: string, arg?: unknown): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(arg);
  }

  /** A killed backend: `pg` emits `error` first, then `end`. */
  killBackend(): void {
    this.emit("error", new Error("terminating connection due to administrator command"));
    this.emit("end");
  }

  deliver(payload: string): void {
    this.emit("notification", { payload });
  }

  /** A client is still wired into its listener while it can relay a NOTIFY. */
  get relaying(): boolean {
    return !this.ended && (this.handlers.get("notification")?.length ?? 0) > 0;
  }
}

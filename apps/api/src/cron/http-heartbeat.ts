const PING_TIMEOUT_MS = 10_000;

export interface IHeartbeat {
  start(): Promise<void>;
  finish(exitCode: number): Promise<void>;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class HttpHeartbeat implements IHeartbeat {
  private readonly url: string | undefined;

  constructor(
    url: string | undefined,
    private readonly report: (message: string) => void,
    private readonly fetchFn: FetchFn = fetch,
  ) {
    this.url = url?.trim();
  }

  start(): Promise<void> {
    return this.ping("/start");
  }

  finish(exitCode: number): Promise<void> {
    return this.ping(exitCode === 0 ? "" : "/fail");
  }

  private async ping(suffix: string): Promise<void> {
    if (!this.url) return;

    try {
      const target = new URL(this.url);
      target.pathname = `${target.pathname.replace(/\/+$/, "")}${suffix}`;
      const answer = await this.fetchFn(target.href, {
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      if (!answer.ok) this.report(`heartbeat ping answered ${answer.status}`);
    } catch (error) {
      const label = error instanceof Error ? error.name : "unknown error";
      this.report(`heartbeat ping failed: ${label}`);
    }
  }
}

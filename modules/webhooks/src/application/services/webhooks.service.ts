import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type { WebhookRepoError } from "../ports/repositories/webhook-endpoint.port";
import type { ICountDeadLettersQuery } from "../queries/count-dead-letters.query";

export class WebhooksService {
  constructor(
    private readonly deadLetters: ICountDeadLettersQuery,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async countDeadLetters(): Promise<Result<number, WebhookRepoError>> {
    return this.instrumentation.startSpan(
      { name: "WebhooksService > countDeadLetters", op: "function" },
      () => this.deadLetters.execute(),
    );
  }
}

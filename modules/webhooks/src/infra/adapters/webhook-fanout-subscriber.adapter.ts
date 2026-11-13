import { AppErrorException, type IInstrumentation, type IUseCase } from "@packages/ddd-kit";
import type { BuiltInEventHandler } from "@packages/outbox/event-handlers";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { fanOutEventToEndpointsOnEvent } from "../../application/event-handlers/fan-out-event-to-endpoints.handler";
import type { WebhookRepoError } from "../../application/ports/repositories/webhook-endpoint.port";
import type { FanOutEventToEndpointsInput } from "../../application/usecases/fan-out-event-to-endpoints/fan-out-event-to-endpoints.dto";

export class WebhookFanoutSubscriber implements BuiltInEventHandler {
  readonly name = "webhook-fanout";
  private readonly react;

  constructor(
    fanOut: IUseCase<FanOutEventToEndpointsInput, void, WebhookRepoError>,
    private readonly instrumentation: IInstrumentation,
  ) {
    this.react = fanOutEventToEndpointsOnEvent({ FanOutEventToEndpointsUseCase: fanOut });
  }

  async handle(event: DeliveredEvent): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookFanoutSubscriber > handle" },
      async () => {
        const fannedOut = await this.react(event, event.payload);
        if (fannedOut.isFailure) throw new AppErrorException(fannedOut.getError());
      },
    );
  }
}

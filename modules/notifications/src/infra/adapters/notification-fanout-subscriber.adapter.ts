import { AppErrorException, type IInstrumentation, type IUseCase } from "@packages/ddd-kit";
import type { BuiltInEventHandler } from "@packages/outbox/event-handlers";
import type { DeliveredEvent } from "@packages/outbox/outbox.port";
import { fanOutNotificationOnEvent } from "../../application/event-handlers/fan-out-notification.handler";
import type {
  FanOutNotificationError,
  FanOutNotificationInput,
} from "../../application/usecases/fan-out-notification/fan-out-notification.dto";

export class NotificationFanoutSubscriber implements BuiltInEventHandler {
  readonly name = "notification-fanout";
  private readonly react;

  constructor(
    fanOutNotification: IUseCase<FanOutNotificationInput, void, FanOutNotificationError>,
    private readonly instrumentation: IInstrumentation,
  ) {
    this.react = fanOutNotificationOnEvent({ FanOutNotificationUseCase: fanOutNotification });
  }

  async handle(event: DeliveredEvent): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "NotificationFanoutSubscriber > handle" },
      async () => {
        try {
          const fannedOut = await this.react(event, event.payload);
          if (fannedOut.isFailure) throw new AppErrorException(fannedOut.getError());
        } catch (err) {
          if (!(err instanceof AppErrorException)) this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}

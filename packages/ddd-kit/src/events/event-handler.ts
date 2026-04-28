import type { IDomainEvent } from "../domain/domain-event";
import type { Result } from "../primitives/result";

export interface IEventHandler<T extends IDomainEvent = IDomainEvent> {
  readonly eventType: string;
  handle(event: T): Promise<Result<void>>;
}

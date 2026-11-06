import type { IDomainEvent } from "./domain-event";
import { type AnyId, Entity } from "./entity";

export interface IAggregate {
  getDomainEvents(): IDomainEvent[];
}

export interface IEventSource {
  pullDomainEvents(): IDomainEvent[];
}

export abstract class Aggregate<T, Id extends AnyId = AnyId>
  extends Entity<T, Id>
  implements IAggregate, IEventSource
{
  private _domainEvents: IDomainEvent[] = [];

  public getDomainEvents(): IDomainEvent[] {
    return [...this._domainEvents];
  }

  public pullDomainEvents(): IDomainEvent[] {
    const drained = [...this._domainEvents];
    this._domainEvents = [];
    return drained;
  }

  protected addEvent(event: IDomainEvent): void {
    this._domainEvents.push(event);
  }

  protected addEvents(events: IDomainEvent[]): void {
    for (const event of events) {
      this.addEvent(event);
    }
  }
}

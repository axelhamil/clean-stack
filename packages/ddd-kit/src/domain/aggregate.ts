import type { UUID } from "../primitives/uuid";
import type { IDomainEvent } from "./domain-event";
import { Entity } from "./entity";

export interface IAggregate {
  readonly domainEvents: IDomainEvent[];
  clearEvents(): void;
}

export abstract class Aggregate<T> extends Entity<T> implements IAggregate {
  private _domainEvents: IDomainEvent[] = [];

  protected constructor(props: T, id?: UUID<string | number>) {
    super(props, id);
  }

  public get domainEvents(): IDomainEvent[] {
    return [...this._domainEvents];
  }

  public clearEvents(): void {
    this._domainEvents = [];
  }

  protected addEvent(event: IDomainEvent): void {
    this._domainEvents.push(event);
  }

  public hasEvents(): boolean {
    return this._domainEvents.length > 0;
  }

  public getEventCount(): number {
    return this._domainEvents.length;
  }

  protected addEvents(events: IDomainEvent[]): void {
    for (const event of events) {
      this.addEvent(event);
    }
  }
}

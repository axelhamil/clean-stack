import { uuidv7 } from "../primitives/uuid";

export interface IDomainEvent<T = unknown> {
  readonly eventId?: string;
  readonly eventType: string;
  readonly dateOccurred: Date;
  readonly aggregateId: string;
  readonly payload: T;
}

export abstract class BaseDomainEvent<T = unknown> implements IDomainEvent<T> {
  readonly eventId: string = uuidv7();
  readonly dateOccurred: Date;
  abstract readonly eventType: string;
  abstract readonly aggregateId: string;
  abstract readonly payload: T;

  constructor(dateOccurred: Date = new Date()) {
    this.dateOccurred = dateOccurred;
  }
}

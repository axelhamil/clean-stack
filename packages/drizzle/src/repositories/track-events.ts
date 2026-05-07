import { type Aggregate, EventCollector, type Result } from "@packages/ddd-kit";

export function trackEventsOnSuccess<T, E, A extends Aggregate<unknown>>(
  result: Result<T, E>,
  aggregate: A,
): Result<T, E> {
  if (result.isSuccess) {
    EventCollector.add(aggregate.pullDomainEvents());
  }
  return result;
}

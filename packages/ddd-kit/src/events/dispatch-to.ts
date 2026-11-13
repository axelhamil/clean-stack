import type { IUseCase } from "../application/use-case";
import type { IDomainEvent } from "../domain/domain-event";
import { Result } from "../primitives/result";

export function dispatchTo<I, O, E, P, T extends IDomainEvent = IDomainEvent>(
  useCase: IUseCase<I, O, E>,
  mapPayload: (payload: P, event: T) => I,
): (event: T, payload: P) => Promise<Result<void, E>> {
  return async (event, payload) => {
    const outcome = await useCase.execute(mapPayload(payload, event));

    return outcome.isFailure ? Result.fail(outcome.getError()) : Result.ok();
  };
}

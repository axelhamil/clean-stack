import type { Result } from "../primitives/result";

export interface UseCase<Input, Output> {
  execute(input: Input): Promise<Result<Output>> | Result<Output>;
}

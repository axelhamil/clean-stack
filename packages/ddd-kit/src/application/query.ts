import type { Result } from "../primitives/result";

export interface IQuery<I, O, E = unknown> {
  execute(input: I): Promise<Result<O, E>>;
}

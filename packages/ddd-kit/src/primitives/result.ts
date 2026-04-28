export class Result<T, E = string> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly _value?: T;
  private readonly _error?: E;

  private constructor(isSuccess: boolean, value?: T, error?: E) {
    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._value = value;
    this._error = error;
  }

  public getValue(): T {
    if (!this.isSuccess) throw new Error("Can't get value from failure result");

    // biome-ignore lint/style/noNonNullAssertion: Safe after isSuccess check
    return this._value!;
  }

  public getError(): E {
    if (this.isSuccess) throw new Error("Can't get error from success result");

    // biome-ignore lint/style/noNonNullAssertion: Safe after isSuccess check
    return this._error!;
  }

  public static ok<T, E = string>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  public static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  public static combine(results: Result<unknown>[]): Result<unknown> {
    for (const result of results) {
      if (result.isFailure) return result;
    }
    return Result.ok();
  }
}

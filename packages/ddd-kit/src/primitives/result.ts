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

    // Safe: the overloads prevent constructing a success Result<T,E> without a value when T ≠ void.
    // The void overload explicitly returns Result<void,E>, so undefined IS the correct value there.
    // biome-ignore lint/style/noNonNullAssertion: proven safe by the ok() overloads above
    return this._value!;
  }

  public getError(): E {
    if (this.isSuccess) throw new Error("Can't get error from success result");

    // biome-ignore lint/style/noNonNullAssertion: Safe after isSuccess check
    return this._error!;
  }

  public static ok<E = string>(): Result<void, E>;
  public static ok<T, E = string>(value: T): Result<T, E>;
  public static ok<T, E = string>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  public static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  public static combine(results: Result<unknown>[]): Result<void> {
    for (const result of results) {
      if (result.isFailure) return result as Result<void>;
    }
    return Result.ok();
  }
}

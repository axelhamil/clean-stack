type ValuesOf<T extends readonly Result<unknown, unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends Result<infer V, unknown> ? V : never;
};

type ErrorOf<R> = R extends Result<unknown, infer E> ? E : never;

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

  public unwrapOr(defaultValue: T): T {
    return this.isSuccess ? this.getValue() : defaultValue;
  }

  public map<U>(f: (value: T) => U): Result<U, E> {
    return this.isSuccess ? Result.ok(f(this.getValue())) : Result.fail(this.getError());
  }

  public flatMap<U, F = E>(f: (value: T) => Result<U, F>): Result<U, E | F> {
    return this.isSuccess ? f(this.getValue()) : Result.fail(this.getError());
  }

  public mapError<F>(f: (error: E) => F): Result<T, F> {
    return this.isSuccess ? Result.ok(this.getValue()) : Result.fail(f(this.getError()));
  }

  public match<U>(patterns: { ok: (value: T) => U; fail: (error: E) => U }): U {
    return this.isSuccess ? patterns.ok(this.getValue()) : patterns.fail(this.getError());
  }

  public static ok<E = string>(): Result<void, E>;
  public static ok<T, E = string>(value: T): Result<T, E>;
  public static ok<T, E = string>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  public static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  public static combine<E = string>(results: readonly Result<unknown, E>[]): Result<void, E> {
    for (const result of results) {
      if (result.isFailure) return Result.fail(result.getError());
    }

    return Result.ok();
  }

  public static all<const T extends readonly Result<unknown, unknown>[]>(
    results: T,
  ): Result<ValuesOf<T>, ErrorOf<T[number]>> {
    for (const result of results) {
      if (result.isFailure) return Result.fail(result.getError() as ErrorOf<T[number]>);
    }

    return Result.ok(results.map((result) => result.getValue()) as ValuesOf<T>);
  }
}

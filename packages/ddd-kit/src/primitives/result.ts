type ValuesOf<T extends readonly Result<unknown, unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends Result<infer V, unknown> ? V : never;
};

type ErrorOf<R> = R extends Result<unknown, infer E> ? E : never;

type ResultState<T, E> = { ok: true; value: T } | { ok: false; error: E };

export class Result<T, E = string> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly state: ResultState<T, E>;

  private constructor(state: ResultState<T, E>) {
    this.isSuccess = state.ok;
    this.isFailure = !state.ok;
    this.state = state;
  }

  public getValue(): T {
    if (!this.state.ok) throw new Error("Can't get value from failure result");

    // Safe: the overloads prevent constructing a success Result<T,E> without a value when T ≠ void.
    // The void overload explicitly returns Result<void,E>, so undefined IS the correct value there.
    return this.state.value;
  }

  public getError(): E {
    if (this.state.ok) throw new Error("Can't get error from success result");

    return this.state.error;
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
  public static ok<T, E = string>(value?: T): Result<T | undefined, E> {
    return new Result<T | undefined, E>({ ok: true, value });
  }

  public static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>({ ok: false, error });
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

import { Result } from "../primitives/result";

export abstract class ValueObject<T> {
  protected readonly _value: T;

  public constructor(value: T) {
    this._value = Object.freeze(value);
  }

  get value(): T {
    return this._value;
  }

  public equals(other: ValueObject<T>): boolean {
    if (this._value === other.value) return true;
    if (
      typeof this._value === "object" &&
      this._value !== null &&
      typeof other.value === "object" &&
      other.value !== null
    ) {
      return JSON.stringify(this._value) === JSON.stringify(other.value);
    }
    return false;
  }

  protected abstract validate(value: T): Result<T>;

  public static create<T extends ValueObject<V>, V>(
    this: new (
      value: V,
    ) => T,
    value: NoInfer<V>,
  ): Result<T> {
    // biome-ignore lint/complexity/noThisInStatic: Need `this` to create instance of subclass
    const ValueObjectConstructor = this as new (value: V) => T;

    const tempInstance = new ValueObjectConstructor(value);
    const validationResult = tempInstance.validate(value);

    if (validationResult.isFailure) return Result.fail(validationResult.getError());

    const validatedValue = validationResult.getValue();
    const finalInstance = new ValueObjectConstructor(validatedValue);
    return Result.ok(finalInstance);
  }
}

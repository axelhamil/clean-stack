import { Result } from "../primitives/result";

function inKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(inKeyOrder);
  if (typeof value !== "object" || value === null) return value;
  if ("toJSON" in value && typeof value.toJSON === "function") return inKeyOrder(value.toJSON());

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, entry]) => [key, inKeyOrder(entry)]),
  );
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(inKeyOrder(left)) === JSON.stringify(inKeyOrder(right));
}

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
      return sameJson(this._value, other.value);
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

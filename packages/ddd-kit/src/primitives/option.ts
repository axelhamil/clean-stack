export abstract class Option<T> {
  abstract isSome(): boolean;
  abstract isNone(): boolean;
  abstract unwrap(): T;
  abstract unwrapOr(defaultValue: T): T;
  abstract unwrapOrElse(f: () => T): T;
  abstract map<U>(f: (value: T) => U): Option<U>;
  abstract filter(predicate: (value: T) => boolean): Option<T>;
  abstract or(optb: Option<T>): Option<T>;
  abstract orElse(f: () => Option<T>): Option<T>;
  abstract xor(optb: Option<T>): Option<T>;
  abstract inspect(f: (value: T) => void): Option<T>;
  abstract flatMap<U>(f: (value: T) => Option<U>): Option<U>;
  abstract toUndefined(): T | undefined;
  abstract toNull(): T | null;

  static some<T>(value: T): Option<T> {
    return Some.of(value);
  }

  static none<T>(): Option<T> {
    return None.of<T>();
  }

  static fromNullable<T>(value: T | null | undefined): Option<T> {
    return value != null ? Option.some(value) : Option.none<T>();
  }
}

export class Some<T> extends Option<T> {
  private constructor(private readonly value: T) {
    super();
  }

  static of<T>(value: T): Option<T> {
    return new Some(value);
  }

  isSome(): boolean {
    return true;
  }

  isNone(): boolean {
    return false;
  }

  unwrap(): T {
    return this.value;
  }

  unwrapOr(_defaultValue: T): T {
    return this.value;
  }

  unwrapOrElse(_f: () => T): T {
    return this.value;
  }

  map<U>(f: (value: T) => U): Option<U> {
    return Option.some(f(this.value));
  }

  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : Option.none<T>();
  }

  or(_optb: Option<T>): Option<T> {
    return this;
  }

  orElse(_f: () => Option<T>): Option<T> {
    return this;
  }

  xor(optb: Option<T>): Option<T> {
    return optb.isNone() ? this : Option.none<T>();
  }

  inspect(f: (value: T) => void): Option<T> {
    f(this.value);
    return this;
  }

  flatMap<U>(f: (value: T) => Option<U>): Option<U> {
    return f(this.value);
  }

  toUndefined(): T | undefined {
    return this.value;
  }

  toNull(): T | null {
    return this.value;
  }

  toString(): string {
    return `Some(${this.value})`;
  }
}

export class None<T> extends Option<T> {
  private constructor() {
    super();
  }

  static of<T>(): Option<T> {
    return new None<T>();
  }

  isSome(): boolean {
    return false;
  }

  isNone(): boolean {
    return true;
  }

  unwrap(): T {
    throw new Error("Called unwrap on a None value");
  }

  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  unwrapOrElse(f: () => T): T {
    return f();
  }

  map<U>(_f: (value: T) => U): Option<U> {
    return Option.none<U>();
  }

  filter(_predicate: (value: T) => boolean): Option<T> {
    return this;
  }

  or(optb: Option<T>): Option<T> {
    return optb;
  }

  orElse(f: () => Option<T>): Option<T> {
    return f();
  }

  xor(optb: Option<T>): Option<T> {
    return optb.isSome() ? optb : Option.none<T>();
  }

  inspect(_f: (value: T) => void): Option<T> {
    return this;
  }

  flatMap<U>(_f: (value: T) => Option<U>): Option<U> {
    return Option.none<U>();
  }

  toUndefined(): T | undefined {
    return undefined;
  }

  toNull(): T | null {
    return null;
  }

  toString(): string {
    return "None";
  }
}

export const match = <T, U>(
  option: Option<T>,
  patterns: {
    Some: (value: T) => U;
    None: () => U;
  },
): U => {
  if (option.isSome()) {
    return patterns.Some(option.unwrap());
  }
  return patterns.None();
};

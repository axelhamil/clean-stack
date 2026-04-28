import { randomUUID } from "node:crypto";

export class UUID<T extends string | number> {
  protected readonly _value: T;

  constructor(value?: T) {
    this._value = value ?? (randomUUID() as T);
  }

  public get value(): T {
    return this._value;
  }

  equals(id?: UUID<T>): boolean {
    if (id === null || id === undefined) {
      return false;
    }
    if (!(id instanceof this.constructor)) {
      return false;
    }
    return id.value === this.value;
  }
}

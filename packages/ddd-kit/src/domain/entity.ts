import { UUID } from "../primitives/uuid";
import { ValueObject } from "./value-object";
import { WatchedList } from "./watched-list";

export interface IEntity<T> {
  readonly _id: UUID<string | number>;
  readonly _props: T;
  equals(object?: IEntity<T>): boolean;
  toObject(): Record<string, unknown>;
}

function isEntity(v: unknown): v is IEntity<unknown> {
  return v instanceof Entity;
}

export abstract class Entity<T> implements IEntity<T> {
  public readonly _props: T;
  public readonly _id: UUID<string | number>;

  protected constructor(props: T, id?: UUID<string | number>) {
    this._id = id || new UUID();
    this._props = props;
  }

  public equals(object?: IEntity<T>): boolean {
    if (!object || !isEntity(object)) return false;
    if (this === object) return true;
    return this._id.equals(object._id);
  }

  get<Key extends keyof T>(key: Key): T[Key] {
    const prop = this._props[key];

    if (key === "id" && !prop) {
      return this._id as unknown as T[Key];
    }

    return prop;
  }

  public toObject(): Record<string, unknown> {
    const plainObject = {} as Record<string, unknown>;
    for (const key in this._props) {
      const prop = this._props[key];
      if (prop instanceof ValueObject || prop instanceof UUID) {
        plainObject[key] = prop.value;
      } else if (prop instanceof Entity) {
        plainObject[key] = prop.toObject();
      } else if (prop instanceof WatchedList) {
        plainObject[key] = prop.mapToObject();
      } else {
        plainObject[key] = prop;
      }
    }

    return {
      ...plainObject,
      id: this._id.value,
    };
  }

  public clone(props?: Partial<T>): Entity<T> {
    const clonedProps = { ...this._props, ...props };

    const EntityConstructor = this.constructor as new (
      props: T,
      id?: UUID<string | number>,
    ) => Entity<T>;

    return new EntityConstructor(clonedProps, this._id);
  }
}

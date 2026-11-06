import { UUID } from "../primitives/uuid";
import { ValueObject } from "./value-object";
import { WatchedList } from "./watched-list";

export type AnyId = UUID<string | number>;

export type IdArgument<Id extends AnyId> = AnyId extends Id ? [id?: Id] : [id: Id];

export interface IEntity<T, Id extends AnyId = AnyId> {
  readonly _id: Id;
  readonly _props: T;
  equals(object?: IEntity<T>): boolean;
  toObject(): Record<string, unknown>;
}

function isEntity(v: unknown): v is IEntity<unknown> {
  return v instanceof Entity;
}

function withOwnCollection(prop: unknown): unknown {
  if (Array.isArray(prop)) return [...prop];
  if (prop instanceof WatchedList) return prop.copy();

  return prop;
}

export abstract class Entity<T, Id extends AnyId = AnyId> implements IEntity<T, Id> {
  public readonly _props: T;
  public readonly _id: Id;

  protected constructor(props: T, ...[id]: IdArgument<Id>) {
    this._id = (id as Id | undefined) ?? (new UUID() as Id);
    this._props = props;
  }

  get id(): Id {
    return this._id;
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

  public clone(props?: Partial<T>): this {
    const EntityConstructor = this.constructor as new (props: T, id: Id) => this;
    const ownProps = Object.fromEntries(
      Object.entries(this._props as Record<string, unknown>).map(([key, prop]) => [
        key,
        withOwnCollection(prop),
      ]),
    ) as T;

    return new EntityConstructor({ ...ownProps, ...props }, this._id);
  }
}

import { describe, expect, it } from "vitest";
import { Entity, Result, UUID, ValueObject, WatchedList } from "../index";

class Name extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    if (!value || value.trim().length === 0) {
      return Result.fail("Name cannot be empty");
    }
    return Result.ok(value);
  }
}

interface TestEntityProps {
  name: string;
  age: number;
}

class TestEntity extends Entity<TestEntityProps> {
  get name() {
    return this._props.name;
  }

  get age() {
    return this._props.age;
  }

  static create(props: TestEntityProps, id?: UUID<string | number>): TestEntity {
    return new TestEntity(props, id);
  }
}

interface EntityWithValueObjectProps {
  name: Name;
  email: string;
}

class EntityWithValueObject extends Entity<EntityWithValueObjectProps> {
  static create(
    props: EntityWithValueObjectProps,
    id?: UUID<string | number>,
  ): EntityWithValueObject {
    return new EntityWithValueObject(props, id);
  }
}

interface NestedEntityProps {
  title: string;
  child: TestEntity;
}

class NestedEntity extends Entity<NestedEntityProps> {
  static create(props: NestedEntityProps, id?: UUID<string | number>): NestedEntity {
    return new NestedEntity(props, id);
  }
}

class StringWatchedList extends WatchedList<string> {
  compareItems(a: string, b: string): boolean {
    return a === b;
  }

  static create(items?: string[]): StringWatchedList {
    return new StringWatchedList(items);
  }
}

interface EntityWithWatchedListProps {
  name: string;
  tags: StringWatchedList;
}

class EntityWithWatchedList extends Entity<EntityWithWatchedListProps> {
  static create(
    props: EntityWithWatchedListProps,
    id?: UUID<string | number>,
  ): EntityWithWatchedList {
    return new EntityWithWatchedList(props, id);
  }
}

interface EntityWithNullableProps {
  name: string;
  nickname: string | null;
  description?: string;
}

class EntityWithNullable extends Entity<EntityWithNullableProps> {
  static create(props: EntityWithNullableProps, id?: UUID<string | number>): EntityWithNullable {
    return new EntityWithNullable(props, id);
  }
}

interface IdPropEntityProps {
  id?: UUID<string | number>;
  name: string;
}

class IdPropEntity extends Entity<IdPropEntityProps> {
  static create(props: IdPropEntityProps, id?: UUID<string | number>): IdPropEntity {
    return new IdPropEntity(props, id);
  }
}

describe("Entity", () => {
  describe("creation", () => {
    it("should create entity with props and id", () => {
      const id = new UUID();
      const entity = TestEntity.create({ name: "John", age: 30 }, id);

      expect(entity._id.equals(id)).toBe(true);
      expect(entity.name).toBe("John");
      expect(entity.age).toBe(30);
    });

    it("should generate id if not provided", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });

      expect(entity._id).toBeDefined();
      expect(entity._id).toBeInstanceOf(UUID);
    });

    it("should create entity with custom string id", () => {
      const id = new UUID("custom-id-123");
      const entity = TestEntity.create({ name: "Jane", age: 25 }, id);

      expect(entity._id.value).toBe("custom-id-123");
    });
  });

  describe("_props", () => {
    it("should access props directly", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });

      expect(entity._props.name).toBe("John");
      expect(entity._props.age).toBe(30);
    });
  });

  describe("get()", () => {
    it("should return prop value by key", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });

      expect(entity.get("name")).toBe("John");
      expect(entity.get("age")).toBe(30);
    });

    it("should return null for null property", () => {
      const entity = EntityWithNullable.create({
        name: "John",
        nickname: null,
      });

      expect(entity.get("nickname")).toBeNull();
    });

    it("should return undefined for undefined property", () => {
      const entity = EntityWithNullable.create({
        name: "John",
        nickname: null,
        description: undefined,
      });

      expect(entity.get("description")).toBeUndefined();
    });

    it("should return empty string for empty string property", () => {
      const entity = EntityWithNullable.create({
        name: "",
        nickname: null,
      });

      expect(entity.get("name")).toBe("");
    });

    it("should return entity id when accessing id prop that is undefined", () => {
      const id = new UUID("test-id");
      const entity = IdPropEntity.create({ name: "Test" }, id);

      expect(entity.get("id")).toBe(id);
    });
  });

  describe("toObject()", () => {
    it("should serialize entity with id", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });
      const obj = entity.toObject();

      expect(obj.id).toBeDefined();
      expect(obj.name).toBe("John");
      expect(obj.age).toBe(30);
    });

    it("should serialize value objects to their values", () => {
      const nameValue: string = "John Doe";
      const nameResult = Name.create(nameValue);
      expect(nameResult.isSuccess).toBe(true);

      const entity = EntityWithValueObject.create({
        name: nameResult.getValue(),
        email: "john@example.com",
      });
      const obj = entity.toObject();

      expect(obj.name).toBe("John Doe");
      expect(obj.email).toBe("john@example.com");
    });

    it("should serialize UUID props to their values", () => {
      const customId = new UUID("custom-uuid");
      const entity = IdPropEntity.create({ id: customId, name: "Test" }, new UUID());
      const obj = entity.toObject();

      expect(obj.id).toBe(entity._id.value);
    });

    it("should serialize nested entities recursively", () => {
      const childEntity = TestEntity.create({ name: "Child", age: 10 });
      const parentEntity = NestedEntity.create({
        title: "Parent",
        child: childEntity,
      });
      const obj = parentEntity.toObject();

      expect(obj.title).toBe("Parent");
      expect(obj.child).toEqual({
        id: childEntity._id.value,
        name: "Child",
        age: 10,
      });
    });

    it("should serialize watched lists using mapToObject", () => {
      const tags = StringWatchedList.create(["tag1", "tag2"]);
      const entity = EntityWithWatchedList.create({ name: "Test", tags });
      const obj = entity.toObject();

      expect(obj.tags).toEqual(["tag1", "tag2"]);
    });

    it("should handle primitive values directly", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });
      const obj = entity.toObject();

      expect(typeof obj.name).toBe("string");
      expect(typeof obj.age).toBe("number");
    });
  });

  describe("clone()", () => {
    it("should create copy with same props and id", () => {
      const id = new UUID();
      const entity = TestEntity.create({ name: "John", age: 30 }, id);
      const clone = entity.clone();

      expect((clone as TestEntity).name).toBe("John");
      expect((clone as TestEntity).age).toBe(30);
      expect(clone._id.equals(entity._id)).toBe(true);
    });

    it("should override props when provided", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });
      const clone = entity.clone({ name: "Jane" });

      expect((clone as TestEntity).name).toBe("Jane");
      expect((clone as TestEntity).age).toBe(30);
    });

    it("should preserve original entity after cloning", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });
      entity.clone({ name: "Jane" });

      expect(entity.name).toBe("John");
    });

    it("should create independent clone", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });
      const clone = entity.clone({ age: 35 }) as TestEntity;

      expect(clone.age).toBe(35);
      expect(entity.age).toBe(30);
    });
  });

  describe("equals()", () => {
    it("should be equal when ids match", () => {
      const id = new UUID();
      const entity1 = TestEntity.create({ name: "John", age: 30 }, id);
      const entity2 = TestEntity.create({ name: "Jane", age: 25 }, id);

      expect(entity1.equals(entity2)).toBe(true);
    });

    it("should not be equal when ids differ", () => {
      const entity1 = TestEntity.create({ name: "John", age: 30 });
      const entity2 = TestEntity.create({ name: "John", age: 30 });

      expect(entity1.equals(entity2)).toBe(false);
    });

    it("should return false when comparing with undefined", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });

      expect(entity.equals(undefined)).toBe(false);
    });

    it("should return true when comparing with same instance", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });

      expect(entity.equals(entity)).toBe(true);
    });

    it("should return false when comparing with non-entity", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });
      const notEntity = { _id: entity._id, _props: { name: "John", age: 30 } };

      expect(entity.equals(notEntity as TestEntity)).toBe(false);
    });
  });

  describe("type safety", () => {
    it("should preserve prop types", () => {
      const entity = TestEntity.create({ name: "John", age: 30 });

      expect(typeof entity.get("name")).toBe("string");
      expect(typeof entity.get("age")).toBe("number");
    });

    it("should work with complex prop types", () => {
      interface ComplexProps {
        data: { nested: string[] };
        count: number;
      }

      class ComplexEntity extends Entity<ComplexProps> {
        static create(props: ComplexProps, id?: UUID<string | number>): ComplexEntity {
          return new ComplexEntity(props, id);
        }
      }

      const entity = ComplexEntity.create({
        data: { nested: ["a", "b", "c"] },
        count: 3,
      });

      expect(entity.get("data").nested).toEqual(["a", "b", "c"]);
      expect(entity.get("count")).toBe(3);
    });
  });
});

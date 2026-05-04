import { describe, expect, it } from "vitest";
import { Entity, Result, UUID, ValueObject, WatchedList } from "../index";

interface Item {
  id: string;
  name: string;
}

class ItemList extends WatchedList<Item> {
  compareItems(a: Item, b: Item): boolean {
    return a.id === b.id;
  }

  static create(initialItems?: Item[]): ItemList {
    return new ItemList(initialItems);
  }
}

class StringList extends WatchedList<string> {
  compareItems(a: string, b: string): boolean {
    return a === b;
  }

  static create(initialItems?: string[]): StringList {
    return new StringList(initialItems);
  }
}

class NumberList extends WatchedList<number> {
  compareItems(a: number, b: number): boolean {
    return a === b;
  }

  static create(initialItems?: number[]): NumberList {
    return new NumberList(initialItems);
  }
}

class Email extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    if (!value.includes("@")) {
      return Result.fail("Invalid email");
    }
    return Result.ok(value);
  }
}

class EmailList extends WatchedList<Email> {
  compareItems(a: Email, b: Email): boolean {
    return a.equals(b);
  }

  static create(initialItems?: Email[]): EmailList {
    return new EmailList(initialItems);
  }
}

interface UserProps {
  name: string;
}

class User extends Entity<UserProps> {
  static create(props: UserProps, id?: UUID<string | number>): User {
    return new User(props, id);
  }
}

class UserList extends WatchedList<User> {
  compareItems(a: User, b: User): boolean {
    return a._id.equals(b._id);
  }

  static create(initialItems?: User[]): UserList {
    return new UserList(initialItems);
  }
}

class UUIDList extends WatchedList<UUID<string>> {
  compareItems(a: UUID<string>, b: UUID<string>): boolean {
    return a.equals(b);
  }

  static create(initialItems?: UUID<string>[]): UUIDList {
    return new UUIDList(initialItems);
  }
}

describe("WatchedList", () => {
  describe("creation", () => {
    it("should create with initial items", () => {
      const items = [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ];
      const list = ItemList.create(items);

      expect(list.getItems()).toHaveLength(2);
    });

    it("should create empty list", () => {
      const list = ItemList.create([]);

      expect(list.getItems()).toHaveLength(0);
    });

    it("should create list without initial items", () => {
      const list = ItemList.create();

      expect(list.getItems()).toHaveLength(0);
    });
  });

  describe("getItems()", () => {
    it("should return a copy of current items", () => {
      const items = [{ id: "1", name: "A" }];
      const list = ItemList.create(items);

      const returned = list.getItems();
      returned.push({ id: "2", name: "B" });

      expect(list.getItems()).toHaveLength(1);
    });
  });

  describe("add()", () => {
    it("should add new item", () => {
      const list = ItemList.create([]);
      list.add({ id: "1", name: "A" });

      expect(list.getItems()).toHaveLength(1);
    });

    it("should track new items", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.add({ id: "2", name: "B" });

      expect(list.getNewItems()).toHaveLength(1);
      expect(list.getNewItems()[0].id).toBe("2");
    });

    it("should not add duplicate", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.add({ id: "1", name: "A Updated" });

      expect(list.getItems()).toHaveLength(1);
    });

    it("should return success Result", () => {
      const list = ItemList.create([]);
      const result = list.add({ id: "1", name: "A" });

      expect(result.isSuccess).toBe(true);
    });

    it("should not track as new if was added initially", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.add({ id: "1", name: "A" });

      expect(list.getNewItems()).toHaveLength(0);
    });

    it("should restore removed item and remove from removed list", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.remove({ id: "1", name: "A" });
      expect(list.getRemovedItems()).toHaveLength(1);

      list.add({ id: "1", name: "A" });

      expect(list.getRemovedItems()).toHaveLength(0);
      expect(list.getItems()).toHaveLength(1);
    });
  });

  describe("remove()", () => {
    it("should remove existing item", () => {
      const items = [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ];
      const list = ItemList.create(items);
      list.remove({ id: "1", name: "A" });

      expect(list.getItems()).toHaveLength(1);
    });

    it("should track removed items", () => {
      const items = [
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ];
      const list = ItemList.create(items);
      list.remove({ id: "1", name: "A" });

      expect(list.getRemovedItems()).toHaveLength(1);
      expect(list.getRemovedItems()[0].id).toBe("1");
    });

    it("should not track removal of newly added items", () => {
      const list = ItemList.create([]);
      list.add({ id: "1", name: "A" });
      list.remove({ id: "1", name: "A" });

      expect(list.getNewItems()).toHaveLength(0);
      expect(list.getRemovedItems()).toHaveLength(0);
    });

    it("should return success Result", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      const result = list.remove({ id: "1", name: "A" });

      expect(result.isSuccess).toBe(true);
    });

    it("should not double-track removed items", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.remove({ id: "1", name: "A" });
      list.remove({ id: "1", name: "A" });

      expect(list.getRemovedItems()).toHaveLength(1);
    });
  });

  describe("change detection", () => {
    it("should detect no changes when unchanged", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);

      expect(list.getNewItems()).toHaveLength(0);
      expect(list.getRemovedItems()).toHaveLength(0);
    });

    it("should handle add then remove of same item", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.add({ id: "2", name: "B" });
      list.remove({ id: "2", name: "B" });

      expect(list.getNewItems()).toHaveLength(0);
    });
  });

  describe("hasChanges()", () => {
    it("should return false when no changes", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);

      expect(list.hasChanges()).toBe(false);
    });

    it("should return true when items added", () => {
      const list = ItemList.create([]);
      list.add({ id: "1", name: "A" });

      expect(list.hasChanges()).toBe(true);
    });

    it("should return true when items removed", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.remove({ id: "1", name: "A" });

      expect(list.hasChanges()).toBe(true);
    });
  });

  describe("find()", () => {
    it("should find existing item", () => {
      const list = ItemList.create([
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]);
      const found = list.find((item) => item.id === "2");

      expect(found.isSome()).toBe(true);
      expect(found.unwrap().name).toBe("B");
    });

    it("should return None for non-existing item", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      const found = list.find((item) => item.id === "99");

      expect(found.isNone()).toBe(true);
    });
  });

  describe("exists()", () => {
    it("should return true for existing item", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);

      expect(list.exists({ id: "1", name: "A" })).toBe(true);
    });

    it("should return false for non-existing item", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);

      expect(list.exists({ id: "2", name: "B" })).toBe(false);
    });

    it("should return false after item removed", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.remove({ id: "1", name: "A" });

      expect(list.exists({ id: "1", name: "A" })).toBe(false);
    });
  });

  describe("count()", () => {
    it("should return 0 for empty list", () => {
      const list = ItemList.create([]);

      expect(list.count()).toBe(0);
    });

    it("should return correct count", () => {
      const list = ItemList.create([
        { id: "1", name: "A" },
        { id: "2", name: "B" },
        { id: "3", name: "C" },
      ]);

      expect(list.count()).toBe(3);
    });

    it("should update count after add", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.add({ id: "2", name: "B" });

      expect(list.count()).toBe(2);
    });

    it("should update count after remove", () => {
      const list = ItemList.create([
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]);
      list.remove({ id: "1", name: "A" });

      expect(list.count()).toBe(1);
    });
  });

  describe("mapToObject()", () => {
    it("should map primitive items directly", () => {
      const list = StringList.create(["a", "b", "c"]);
      const result = list.mapToObject();

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should map number items directly", () => {
      const list = NumberList.create([1, 2, 3]);
      const result = list.mapToObject();

      expect(result).toEqual([1, 2, 3]);
    });

    it("should map ValueObject items to their values", () => {
      const email1 = Email.create("a@test.com").getValue();
      const email2 = Email.create("b@test.com").getValue();
      const list = EmailList.create([email1, email2]);
      const result = list.mapToObject();

      expect(result).toEqual(["a@test.com", "b@test.com"]);
    });

    it("should map Entity items using toObject()", () => {
      const user1 = User.create({ name: "Alice" });
      const user2 = User.create({ name: "Bob" });
      const list = UserList.create([user1, user2]);
      const result = list.mapToObject();

      expect(result).toHaveLength(2);
      expect((result[0] as { name: string }).name).toBe("Alice");
      expect((result[1] as { name: string }).name).toBe("Bob");
    });

    it("should map UUID items to their values", () => {
      const uuid1 = new UUID<string>("uuid-1");
      const uuid2 = new UUID<string>("uuid-2");
      const list = UUIDList.create([uuid1, uuid2]);
      const result = list.mapToObject();

      expect(result).toEqual(["uuid-1", "uuid-2"]);
    });

    it("should map complex object items directly", () => {
      const list = ItemList.create([
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]);
      const result = list.mapToObject();

      expect(result).toEqual([
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]);
    });
  });

  describe("getNewItems()", () => {
    it("should return empty array when no new items", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);

      expect(list.getNewItems()).toHaveLength(0);
    });

    it("should return a copy of new items", () => {
      const list = ItemList.create([]);
      list.add({ id: "1", name: "A" });

      const newItems1 = list.getNewItems();
      const newItems2 = list.getNewItems();

      expect(newItems1).not.toBe(newItems2);
      expect(newItems1).toEqual(newItems2);
    });
  });

  describe("getRemovedItems()", () => {
    it("should return empty array when no removed items", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);

      expect(list.getRemovedItems()).toHaveLength(0);
    });

    it("should return a copy of removed items", () => {
      const list = ItemList.create([{ id: "1", name: "A" }]);
      list.remove({ id: "1", name: "A" });

      const removed1 = list.getRemovedItems();
      const removed2 = list.getRemovedItems();

      expect(removed1).not.toBe(removed2);
      expect(removed1).toEqual(removed2);
    });
  });

  describe("edge cases", () => {
    it("should handle multiple additions and removals", () => {
      const list = ItemList.create([
        { id: "1", name: "A" },
        { id: "2", name: "B" },
      ]);

      list.add({ id: "3", name: "C" });
      list.add({ id: "4", name: "D" });
      list.remove({ id: "1", name: "A" });
      list.remove({ id: "3", name: "C" });

      expect(list.getItems()).toHaveLength(2);
      expect(list.getNewItems()).toHaveLength(1);
      expect(list.getRemovedItems()).toHaveLength(1);
    });

    it("should track removal even for non-existing items", () => {
      // Current behavior: removing a non-existing item still tracks it as removed
      // This is by design - the WatchedList tracks intent, not validation
      const list = ItemList.create([]);
      list.remove({ id: "1", name: "A" });

      expect(list.getItems()).toHaveLength(0);
      expect(list.getRemovedItems()).toHaveLength(1);
    });

    it("should work with primitive string items", () => {
      const list = StringList.create(["a", "b"]);
      list.add("c");
      list.remove("a");

      expect(list.getItems()).toEqual(["b", "c"]);
      expect(list.getNewItems()).toEqual(["c"]);
      expect(list.getRemovedItems()).toEqual(["a"]);
    });

    it("should work with primitive number items", () => {
      const list = NumberList.create([1, 2, 3]);
      list.add(4);
      list.remove(2);

      expect(list.getItems()).toEqual([1, 3, 4]);
      expect(list.getNewItems()).toEqual([4]);
      expect(list.getRemovedItems()).toEqual([2]);
    });
  });
});

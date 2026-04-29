import { beforeEach, describe, expect, it } from "vitest";
import {
  type BaseRepository,
  createPaginatedResult,
  DEFAULT_PAGINATION,
  Entity,
  Option,
  type PaginatedResult,
  type PaginationParams,
  Result,
  UUID,
} from "../index";

interface UserProps {
  name: string;
  email: string;
}

class User extends Entity<UserProps> {
  get name() {
    return this._props.name;
  }

  get email() {
    return this._props.email;
  }

  static create(props: UserProps, id?: UUID<string | number>): User {
    return new User(props, id);
  }
}

class MockUserRepository implements BaseRepository<User> {
  private users: User[] = [];

  async create(entity: User): Promise<Result<User>> {
    this.users.push(entity);
    return Result.ok(entity);
  }

  async update(entity: User): Promise<Result<User>> {
    const index = this.users.findIndex((u) => u._id.equals(entity._id));
    if (index === -1) return Result.fail("User not found");
    this.users[index] = entity;
    return Result.ok(entity);
  }

  async delete(id: UUID<string | number>): Promise<Result<UUID<string | number>>> {
    const index = this.users.findIndex((u) => u._id.equals(id));
    if (index === -1) return Result.fail("User not found");
    this.users.splice(index, 1);
    return Result.ok(id);
  }

  async findById(id: UUID<string | number>): Promise<Result<Option<User>>> {
    const user = this.users.find((u) => u._id.equals(id));
    return Result.ok(Option.fromNullable(user));
  }

  async findAll(pagination?: PaginationParams): Promise<Result<PaginatedResult<User>>> {
    const params = pagination ?? DEFAULT_PAGINATION;
    const start = (params.page - 1) * params.limit;
    const data = this.users.slice(start, start + params.limit);
    return Result.ok(createPaginatedResult(data, params, this.users.length));
  }

  async findMany(
    props: Partial<UserProps>,
    pagination?: PaginationParams,
  ): Promise<Result<PaginatedResult<User>>> {
    const filtered = this.users.filter((u) =>
      Object.entries(props).every(([k, v]) => u._props[k as keyof UserProps] === v),
    );
    const params = pagination ?? DEFAULT_PAGINATION;
    const start = (params.page - 1) * params.limit;
    const data = filtered.slice(start, start + params.limit);
    return Result.ok(createPaginatedResult(data, params, filtered.length));
  }

  async findBy(props: Partial<UserProps>): Promise<Result<Option<User>>> {
    const user = this.users.find((u) =>
      Object.entries(props).every(([k, v]) => u._props[k as keyof UserProps] === v),
    );
    return Result.ok(Option.fromNullable(user));
  }

  async exists(id: UUID<string | number>): Promise<Result<boolean>> {
    return Result.ok(this.users.some((u) => u._id.equals(id)));
  }

  async count(): Promise<Result<number>> {
    return Result.ok(this.users.length);
  }
}

describe("BaseRepository", () => {
  let repo: MockUserRepository;

  beforeEach(() => {
    repo = new MockUserRepository();
  });

  describe("create()", () => {
    it("should create and return entity", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });

      const result = await repo.create(user);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()._id.equals(user._id)).toBe(true);
    });

    it("should persist entity for retrieval", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });
      await repo.create(user);

      const findResult = await repo.findById(user._id);

      expect(findResult.getValue().isSome()).toBe(true);
    });
  });

  describe("update()", () => {
    it("should update existing entity", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });
      await repo.create(user);

      const updatedUser = user.clone({ name: "John Updated" }) as User;
      const result = await repo.update(updatedUser);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().name).toBe("John Updated");
    });

    it("should fail when entity not found", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });

      const result = await repo.update(user);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("User not found");
    });
  });

  describe("delete()", () => {
    it("should delete existing entity", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });
      await repo.create(user);

      const result = await repo.delete(user._id);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().equals(user._id)).toBe(true);
    });

    it("should fail when entity not found", async () => {
      const id = new UUID("nonexistent");

      const result = await repo.delete(id);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBe("User not found");
    });

    it("should remove entity from storage", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });
      await repo.create(user);
      await repo.delete(user._id);

      const findResult = await repo.findById(user._id);

      expect(findResult.getValue().isNone()).toBe(true);
    });
  });

  describe("findById()", () => {
    it("should return Some when entity found", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });
      await repo.create(user);

      const result = await repo.findById(user._id);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isSome()).toBe(true);
      expect(result.getValue().unwrap().name).toBe("John");
    });

    it("should return None when entity not found", async () => {
      const id = new UUID("nonexistent");

      const result = await repo.findById(id);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
    });
  });

  describe("findAll()", () => {
    it("should return all entities with default pagination", async () => {
      await repo.create(User.create({ name: "User 1", email: "u1@test.com" }));
      await repo.create(User.create({ name: "User 2", email: "u2@test.com" }));

      const result = await repo.findAll();

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().data).toHaveLength(2);
      expect(result.getValue().pagination.page).toBe(1);
      expect(result.getValue().pagination.limit).toBe(20);
    });

    it("should return paginated results", async () => {
      for (let i = 0; i < 25; i++) {
        await repo.create(User.create({ name: `User ${i}`, email: `u${i}@test.com` }));
      }

      const result = await repo.findAll({ page: 1, limit: 10 });

      expect(result.getValue().data).toHaveLength(10);
      expect(result.getValue().pagination.total).toBe(25);
      expect(result.getValue().pagination.totalPages).toBe(3);
      expect(result.getValue().pagination.hasNextPage).toBe(true);
      expect(result.getValue().pagination.hasPreviousPage).toBe(false);
    });

    it("should return second page", async () => {
      for (let i = 0; i < 25; i++) {
        await repo.create(User.create({ name: `User ${i}`, email: `u${i}@test.com` }));
      }

      const result = await repo.findAll({ page: 2, limit: 10 });

      expect(result.getValue().data).toHaveLength(10);
      expect(result.getValue().pagination.page).toBe(2);
      expect(result.getValue().pagination.hasNextPage).toBe(true);
      expect(result.getValue().pagination.hasPreviousPage).toBe(true);
    });

    it("should return last page with fewer items", async () => {
      for (let i = 0; i < 25; i++) {
        await repo.create(User.create({ name: `User ${i}`, email: `u${i}@test.com` }));
      }

      const result = await repo.findAll({ page: 3, limit: 10 });

      expect(result.getValue().data).toHaveLength(5);
      expect(result.getValue().pagination.hasNextPage).toBe(false);
    });
  });

  describe("findMany()", () => {
    it("should filter by properties", async () => {
      await repo.create(User.create({ name: "John", email: "john1@test.com" }));
      await repo.create(User.create({ name: "John", email: "john2@test.com" }));
      await repo.create(User.create({ name: "Jane", email: "jane@test.com" }));

      const result = await repo.findMany({ name: "John" });

      expect(result.getValue().data).toHaveLength(2);
      expect(result.getValue().pagination.total).toBe(2);
    });

    it("should return empty when no match", async () => {
      await repo.create(User.create({ name: "John", email: "john@test.com" }));

      const result = await repo.findMany({ name: "Jane" });

      expect(result.getValue().data).toHaveLength(0);
      expect(result.getValue().pagination.total).toBe(0);
    });

    it("should filter with pagination", async () => {
      for (let i = 0; i < 15; i++) {
        await repo.create(User.create({ name: "John", email: `john${i}@test.com` }));
      }
      await repo.create(User.create({ name: "Jane", email: "jane@test.com" }));

      const result = await repo.findMany({ name: "John" }, { page: 1, limit: 10 });

      expect(result.getValue().data).toHaveLength(10);
      expect(result.getValue().pagination.total).toBe(15);
      expect(result.getValue().pagination.totalPages).toBe(2);
    });
  });

  describe("findBy()", () => {
    it("should return Some when match found", async () => {
      await repo.create(User.create({ name: "John", email: "john@test.com" }));

      const result = await repo.findBy({ email: "john@test.com" });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isSome()).toBe(true);
      expect(result.getValue().unwrap().name).toBe("John");
    });

    it("should return None when no match", async () => {
      await repo.create(User.create({ name: "John", email: "john@test.com" }));

      const result = await repo.findBy({ email: "jane@test.com" });

      expect(result.getValue().isNone()).toBe(true);
    });

    it("should match multiple properties", async () => {
      await repo.create(User.create({ name: "John", email: "john@test.com" }));
      await repo.create(User.create({ name: "John", email: "john2@test.com" }));

      const result = await repo.findBy({
        name: "John",
        email: "john2@test.com",
      });

      expect(result.getValue().isSome()).toBe(true);
      expect(result.getValue().unwrap().email).toBe("john2@test.com");
    });
  });

  describe("exists()", () => {
    it("should return true when entity exists", async () => {
      const user = User.create({ name: "John", email: "john@test.com" });
      await repo.create(user);

      const result = await repo.exists(user._id);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(true);
    });

    it("should return false when entity does not exist", async () => {
      const id = new UUID("nonexistent");

      const result = await repo.exists(id);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(false);
    });
  });

  describe("count()", () => {
    it("should return 0 when empty", async () => {
      const result = await repo.count();

      expect(result.isSuccess).toBe(true);
      expect(result.getValue()).toBe(0);
    });

    it("should return correct count", async () => {
      await repo.create(User.create({ name: "User 1", email: "u1@test.com" }));
      await repo.create(User.create({ name: "User 2", email: "u2@test.com" }));
      await repo.create(User.create({ name: "User 3", email: "u3@test.com" }));

      const result = await repo.count();

      expect(result.getValue()).toBe(3);
    });

    it("should update after create and delete", async () => {
      const user = User.create({ name: "User", email: "u@test.com" });
      await repo.create(user);
      expect((await repo.count()).getValue()).toBe(1);

      await repo.delete(user._id);
      expect((await repo.count()).getValue()).toBe(0);
    });
  });
});

describe("Pagination", () => {
  describe("createPaginatedResult()", () => {
    it("should create result with correct pagination metadata", () => {
      const data = [1, 2, 3, 4, 5];
      const params: PaginationParams = { page: 1, limit: 5 };

      const result = createPaginatedResult(data, params, 15);

      expect(result.data).toEqual(data);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(5);
      expect(result.pagination.total).toBe(15);
      expect(result.pagination.totalPages).toBe(3);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });

    it("should calculate hasNextPage correctly", () => {
      const result = createPaginatedResult([1, 2], { page: 3, limit: 5 }, 15);

      expect(result.pagination.hasNextPage).toBe(false);
    });

    it("should calculate hasPreviousPage correctly", () => {
      const result1 = createPaginatedResult([1, 2], { page: 1, limit: 5 }, 15);
      const result2 = createPaginatedResult([1, 2], { page: 2, limit: 5 }, 15);

      expect(result1.pagination.hasPreviousPage).toBe(false);
      expect(result2.pagination.hasPreviousPage).toBe(true);
    });

    it("should handle empty data", () => {
      const result = createPaginatedResult([], { page: 1, limit: 10 }, 0);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });

    it("should handle single page", () => {
      const result = createPaginatedResult([1, 2, 3], { page: 1, limit: 10 }, 3);

      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNextPage).toBe(false);
      expect(result.pagination.hasPreviousPage).toBe(false);
    });
  });

  describe("DEFAULT_PAGINATION", () => {
    it("should have correct default values", () => {
      expect(DEFAULT_PAGINATION.page).toBe(1);
      expect(DEFAULT_PAGINATION.limit).toBe(20);
    });
  });
});

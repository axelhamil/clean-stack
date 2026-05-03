import { beforeEach, describe, expect, it } from "vitest";
import {
  type BaseRepository,
  createPaginatedResult,
  DEFAULT_PAGINATION,
  Entity,
  Option,
  type PaginatedResult,
  type PaginationParams,
  RepoScope,
  Result,
  type ScopedRepository,
  type ScopeOf,
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

interface NoteProps {
  ownerId: UUID<string>;
  body: string;
}

class Note extends Entity<NoteProps> {
  get ownerId() {
    return this._props.ownerId;
  }

  get body() {
    return this._props.body;
  }

  static create(props: NoteProps, id?: UUID<string>): Note {
    return new Note(props, id);
  }
}

class MockScopedNoteRepository implements ScopedRepository<Note, ScopeOf<"user">> {
  private notes: Note[] = [];

  private isOwner(n: Note, scope: ScopeOf<"user">): boolean {
    return n.ownerId.equals(scope.userId);
  }

  async create(entity: Note, scope: ScopeOf<"user">): Promise<Result<Note>> {
    if (!entity.ownerId.equals(scope.userId)) return Result.fail("Owner mismatch");
    this.notes.push(entity);
    return Result.ok(entity);
  }

  async update(entity: Note, scope: ScopeOf<"user">): Promise<Result<Note>> {
    const i = this.notes.findIndex((n) => n._id.equals(entity._id) && this.isOwner(n, scope));
    if (i === -1) return Result.fail("Note not found");
    this.notes[i] = entity;
    return Result.ok(entity);
  }

  async delete(id: UUID<string>, scope: ScopeOf<"user">): Promise<Result<UUID<string>>> {
    const i = this.notes.findIndex((n) => n._id.equals(id) && this.isOwner(n, scope));
    if (i === -1) return Result.fail("Note not found");
    this.notes.splice(i, 1);
    return Result.ok(id);
  }

  async findById(id: UUID<string>, scope: ScopeOf<"user">): Promise<Result<Option<Note>>> {
    const n = this.notes.find((x) => x._id.equals(id) && this.isOwner(x, scope));
    return Result.ok(Option.fromNullable(n));
  }

  async findAll(
    scope: ScopeOf<"user">,
    pagination?: PaginationParams,
  ): Promise<Result<PaginatedResult<Note>>> {
    const filtered = this.notes.filter((n) => this.isOwner(n, scope));
    const params = pagination ?? DEFAULT_PAGINATION;
    const start = (params.page - 1) * params.limit;
    return Result.ok(
      createPaginatedResult(filtered.slice(start, start + params.limit), params, filtered.length),
    );
  }

  async findMany(
    props: Partial<NoteProps>,
    scope: ScopeOf<"user">,
    pagination?: PaginationParams,
  ): Promise<Result<PaginatedResult<Note>>> {
    const filtered = this.notes.filter(
      (n) =>
        this.isOwner(n, scope) &&
        Object.entries(props).every(([k, v]) => n._props[k as keyof NoteProps] === v),
    );
    const params = pagination ?? DEFAULT_PAGINATION;
    const start = (params.page - 1) * params.limit;
    return Result.ok(
      createPaginatedResult(filtered.slice(start, start + params.limit), params, filtered.length),
    );
  }

  async findBy(props: Partial<NoteProps>, scope: ScopeOf<"user">): Promise<Result<Option<Note>>> {
    const n = this.notes.find(
      (x) =>
        this.isOwner(x, scope) &&
        Object.entries(props).every(([k, v]) => x._props[k as keyof NoteProps] === v),
    );
    return Result.ok(Option.fromNullable(n));
  }

  async exists(id: UUID<string>, scope: ScopeOf<"user">): Promise<Result<boolean>> {
    return Result.ok(this.notes.some((n) => n._id.equals(id) && this.isOwner(n, scope)));
  }

  async count(scope: ScopeOf<"user">): Promise<Result<number>> {
    return Result.ok(this.notes.filter((n) => this.isOwner(n, scope)).length);
  }
}

describe("ScopedRepository", () => {
  const alice = new UUID<string>("alice");
  const bob = new UUID<string>("bob");
  const aliceScope = RepoScope.user(alice);
  const bobScope = RepoScope.user(bob);

  let repo: MockScopedNoteRepository;

  beforeEach(() => {
    repo = new MockScopedNoteRepository();
  });

  describe("findById()", () => {
    it("should return Some for the owner", async () => {
      const note = Note.create({ ownerId: alice, body: "secret" });
      await repo.create(note, aliceScope);

      const result = await repo.findById(note._id, aliceScope);

      expect(result.getValue().isSome()).toBe(true);
    });

    it("should return None when scope belongs to another user (no existence leak)", async () => {
      const note = Note.create({ ownerId: alice, body: "secret" });
      await repo.create(note, aliceScope);

      const result = await repo.findById(note._id, bobScope);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().isNone()).toBe(true);
    });
  });

  describe("delete()", () => {
    it("should fail (not found) when scope belongs to another user", async () => {
      const note = Note.create({ ownerId: alice, body: "secret" });
      await repo.create(note, aliceScope);

      const result = await repo.delete(note._id, bobScope);

      expect(result.isFailure).toBe(true);

      const stillThere = await repo.findById(note._id, aliceScope);
      expect(stillThere.getValue().isSome()).toBe(true);
    });
  });

  describe("update()", () => {
    it("should fail when scope belongs to another user", async () => {
      const note = Note.create({ ownerId: alice, body: "v1" });
      await repo.create(note, aliceScope);

      const tampered = note.clone({ body: "v2-bob" }) as Note;
      const result = await repo.update(tampered, bobScope);

      expect(result.isFailure).toBe(true);
    });
  });

  describe("findAll() / count() / exists()", () => {
    it("should isolate per-owner views", async () => {
      await repo.create(Note.create({ ownerId: alice, body: "a1" }), aliceScope);
      await repo.create(Note.create({ ownerId: alice, body: "a2" }), aliceScope);
      await repo.create(Note.create({ ownerId: bob, body: "b1" }), bobScope);

      const aliceList = await repo.findAll(aliceScope);
      const bobList = await repo.findAll(bobScope);
      const aliceCount = await repo.count(aliceScope);
      const bobCount = await repo.count(bobScope);

      expect(aliceList.getValue().pagination.total).toBe(2);
      expect(bobList.getValue().pagination.total).toBe(1);
      expect(aliceCount.getValue()).toBe(2);
      expect(bobCount.getValue()).toBe(1);
    });

    it("exists() should not leak existence across owners", async () => {
      const note = Note.create({ ownerId: alice, body: "secret" });
      await repo.create(note, aliceScope);

      expect((await repo.exists(note._id, aliceScope)).getValue()).toBe(true);
      expect((await repo.exists(note._id, bobScope)).getValue()).toBe(false);
    });
  });
});

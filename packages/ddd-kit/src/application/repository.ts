import type { IEntity } from "../domain/entity";
import type { Option } from "../primitives/option";
import type { Result } from "../primitives/result";
import type { PaginatedResult, PaginationParams } from "./pagination";
import type { RepoScope } from "./scope";

export interface BaseRepository<T extends IEntity<unknown>, TTransaction = unknown, E = string> {
  create(entity: T, trx?: TTransaction): Promise<Result<T, E>>;
  update(entity: T, trx?: TTransaction): Promise<Result<T, E>>;
  delete(id: T["_id"], trx?: TTransaction): Promise<Result<T["_id"], E>>;
  findById(id: T["_id"]): Promise<Result<Option<T>, E>>;
  findAll(pagination?: PaginationParams): Promise<Result<PaginatedResult<T>, E>>;
  findMany(
    props: Partial<T["_props"]>,
    pagination?: PaginationParams,
  ): Promise<Result<PaginatedResult<T>, E>>;
  findBy(props: Partial<T["_props"]>): Promise<Result<Option<T>, E>>;
  exists(id: T["_id"]): Promise<Result<boolean, E>>;
  count(): Promise<Result<number, E>>;
}

export interface ScopedRepository<
  T extends IEntity<unknown>,
  TScope extends RepoScope,
  TTransaction = unknown,
  E = string,
> {
  create(entity: T, scope: TScope, trx?: TTransaction): Promise<Result<T, E>>;
  update(entity: T, scope: TScope, trx?: TTransaction): Promise<Result<T, E>>;
  delete(id: T["_id"], scope: TScope, trx?: TTransaction): Promise<Result<T["_id"], E>>;
  findById(id: T["_id"], scope: TScope): Promise<Result<Option<T>, E>>;
  findAll(scope: TScope, pagination?: PaginationParams): Promise<Result<PaginatedResult<T>, E>>;
  findMany(
    props: Partial<T["_props"]>,
    scope: TScope,
    pagination?: PaginationParams,
  ): Promise<Result<PaginatedResult<T>, E>>;
  findBy(props: Partial<T["_props"]>, scope: TScope): Promise<Result<Option<T>, E>>;
  exists(id: T["_id"], scope: TScope): Promise<Result<boolean, E>>;
  count(scope: TScope): Promise<Result<number, E>>;
}

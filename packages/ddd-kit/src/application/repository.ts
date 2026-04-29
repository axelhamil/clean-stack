import type { IEntity } from "../domain/entity";
import type { Option } from "../primitives/option";
import type { Result } from "../primitives/result";
import type { PaginatedResult, PaginationParams } from "./pagination";

export interface BaseRepository<T extends IEntity<unknown>, TTransaction = unknown> {
  create(entity: T, trx?: TTransaction): Promise<Result<T>>;
  update(entity: T, trx?: TTransaction): Promise<Result<T>>;
  delete(id: T["_id"], trx?: TTransaction): Promise<Result<T["_id"]>>;
  findById(id: T["_id"]): Promise<Result<Option<T>>>;
  findAll(pagination?: PaginationParams): Promise<Result<PaginatedResult<T>>>;
  findMany(
    props: Partial<T["_props"]>,
    pagination?: PaginationParams,
  ): Promise<Result<PaginatedResult<T>>>;
  findBy(props: Partial<T["_props"]>): Promise<Result<Option<T>>>;
  exists(id: T["_id"]): Promise<Result<boolean>>;
  count(): Promise<Result<number>>;
}

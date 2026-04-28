import { None, type Option, Some } from "../primitives/option";
import { Result } from "../primitives/result";
import { UUID } from "../primitives/uuid";
import { ValueObject } from "./value-object";

export abstract class WatchedList<T> {
  private currentItems: T[];
  private initial: T[];
  private new: T[];
  private removed: T[];

  protected constructor(initialItems?: T[]) {
    this.currentItems = initialItems ?? [];
    this.initial = initialItems ?? [];
    this.new = [];
    this.removed = [];
  }

  abstract compareItems(a: T, b: T): boolean;

  public getItems(): T[] {
    return [...this.currentItems];
  }

  public getNewItems(): T[] {
    return [...this.new];
  }

  public getRemovedItems(): T[] {
    return [...this.removed];
  }

  public hasChanges(): boolean {
    return this.new.length > 0 || this.removed.length > 0;
  }

  public add(item: T): Result<void> {
    if (this.isRemovedItem(item)) this.removeFromRemoved(item);

    if (!this.isNewItem(item) && !this.wasAddedInitially(item))
      this.new.push(item);

    if (!this.isCurrentItem(item)) this.currentItems.push(item);

    return Result.ok();
  }

  public remove(item: T): Result<void> {
    this.removeFromCurrent(item);

    if (this.isNewItem(item)) {
      this.removeFromNew(item);
      return Result.ok();
    }

    if (!this.isRemovedItem(item)) this.removed.push(item);

    return Result.ok();
  }

  public find(predicate: (item: T) => boolean): Option<T> {
    const item = this.currentItems.find(predicate);
    return item ? Some.of(item) : None.of<T>();
  }

  public exists(item: T): boolean {
    return this.isCurrentItem(item);
  }

  public count(): number {
    return this.currentItems.length;
  }

  public mapToObject(): unknown[] {
    return this.currentItems.map((item) => {
      if (item instanceof ValueObject || item instanceof UUID)
        return item.value;

      if (
        item &&
        typeof item === "object" &&
        "toObject" in item &&
        typeof item.toObject === "function"
      )
        return item.toObject();

      return item;
    });
  }

  private isCurrentItem(item: T): boolean {
    return this.currentItems.some((v) => this.compareItems(item, v));
  }

  private isNewItem(item: T): boolean {
    return this.new.some((v) => this.compareItems(item, v));
  }

  private isRemovedItem(item: T): boolean {
    return this.removed.some((v) => this.compareItems(item, v));
  }

  private wasAddedInitially(item: T): boolean {
    return this.initial.some((v) => this.compareItems(item, v));
  }

  private removeFromNew(item: T): void {
    this.new = this.new.filter((v) => !this.compareItems(v, item));
  }

  private removeFromCurrent(item: T): void {
    this.currentItems = this.currentItems.filter(
      (v) => !this.compareItems(item, v),
    );
  }

  private removeFromRemoved(item: T): void {
    this.removed = this.removed.filter((v) => !this.compareItems(v, item));
  }
}

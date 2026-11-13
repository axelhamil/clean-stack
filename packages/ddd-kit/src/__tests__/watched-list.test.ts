import { describe, expect, it } from "vitest";
import { WatchedList } from "../index";

interface Tag {
  id: string;
  label: string;
}

class Tags extends WatchedList<Tag> {
  compareItems(a: Tag, b: Tag): boolean {
    return a.id === b.id;
  }

  static create(initialItems?: Tag[]): Tags {
    return new Tags(initialItems);
  }
}

const fps: Tag = { id: "fps", label: "FPS" };
const clutch: Tag = { id: "clutch", label: "Clutch" };
const funny: Tag = { id: "funny", label: "Funny" };

class Scores extends WatchedList<number> {
  compareItems(a: number, b: number): boolean {
    return a === b;
  }

  static create(initialItems?: number[]): Scores {
    return new Scores(initialItems);
  }
}

describe("WatchedList", () => {
  it("starts with its stored items and nothing to persist", () => {
    const tags = Tags.create([fps, clutch]);

    expect(tags.getItems()).toEqual([fps, clutch]);
    expect(tags.hasChanges()).toBe(false);
    expect(tags.getNewItems()).toEqual([]);
    expect(tags.getRemovedItems()).toEqual([]);
  });

  it("tracks an added item as new", () => {
    const tags = Tags.create([fps]);

    tags.add(funny);

    expect(tags.getItems()).toEqual([fps, funny]);
    expect(tags.getNewItems()).toEqual([funny]);
    expect(tags.getRemovedItems()).toEqual([]);
  });

  it("ignores an item it already holds, compared by the list's own rule", () => {
    const tags = Tags.create([fps]);

    tags.add({ id: "fps", label: "Shooter" });
    tags.add(funny);
    tags.add({ ...funny });

    expect(tags.getItems()).toEqual([fps, funny]);
    expect(tags.getNewItems()).toEqual([funny]);
  });

  it("tracks a removed stored item as removed, once however often it is removed", () => {
    const tags = Tags.create([fps, clutch]);

    tags.remove(fps);
    tags.remove(fps);

    expect(tags.getItems()).toEqual([clutch]);
    expect(tags.getRemovedItems()).toEqual([fps]);
    expect(tags.getNewItems()).toEqual([]);
  });

  it("leaves no trace of an item added then removed before saving", () => {
    const tags = Tags.create([fps]);

    tags.add(funny);
    tags.remove(funny);

    expect(tags.getItems()).toEqual([fps]);
    expect(tags.hasChanges()).toBe(false);
  });

  it("cancels the removal of a stored item added back", () => {
    const tags = Tags.create([fps, clutch]);

    tags.remove(fps);
    tags.add(fps);

    expect(tags.exists(fps)).toBe(true);
    expect(tags.getRemovedItems()).toEqual([]);
    expect(tags.getNewItems()).toEqual([]);
    expect(tags.hasChanges()).toBe(false);
  });

  it("hands out copies, so a caller cannot change the bookkeeping", () => {
    const tags = Tags.create([fps]);
    tags.add(funny);

    tags.getItems().push(clutch);
    tags.getNewItems().pop();

    expect(tags.getItems()).toEqual([fps, funny]);
    expect(tags.getNewItems()).toEqual([funny]);
  });

  it("tracks an item added, removed then added back as new, and leaves the given array alone", () => {
    const stored = [fps];
    const tags = Tags.create(stored);

    tags.add(funny);
    tags.remove(funny);
    tags.add(funny);

    expect(tags.getNewItems()).toEqual([funny]);
    expect(stored).toEqual([fps]);
  });

  it("finds a falsy item", () => {
    const scores = Scores.create([0, 3]);

    const found = scores.find((score) => score === 0);

    expect(found.isSome()).toBe(true);
    expect(found.unwrapOr(-1)).toBe(0);
  });
});

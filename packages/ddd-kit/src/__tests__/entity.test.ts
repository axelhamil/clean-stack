import { describe, expect, it } from "vitest";
import { Entity, Result, UUID, ValueObject, WatchedList } from "../index";

class Title extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    return value.length > 0 ? Result.ok(value) : Result.fail("Title cannot be empty");
  }
}

class Tags extends WatchedList<Title> {
  compareItems(a: Title, b: Title): boolean {
    return a.equals(b);
  }

  static create(items: Title[]): Tags {
    return new Tags(items);
  }
}

class Cover extends Entity<{ path: string }> {
  static create(props: { path: string }, id?: UUID<string>): Cover {
    return new Cover(props, id);
  }
}

interface ClipProps {
  title: Title;
  recordingId: UUID<string>;
  cover: Cover;
  tags: Tags;
  aliases: string[];
  attempts: number;
}

class Clip extends Entity<ClipProps> {
  static create(props: ClipProps, id?: UUID<string>): Clip {
    return new Clip(props, id);
  }
}

class TakeId extends UUID<string> {}

class Take extends Entity<{ attempts: number }, TakeId> {
  private constructor(props: { attempts: number }, id: TakeId) {
    super(props, id);
  }

  static create(props: { attempts: number }): Take {
    return new Take(props, new TakeId());
  }
}

const title = (value: string) => Title.create(value).getValue();

const clipProps = (): ClipProps => ({
  title: title("Clutch"),
  recordingId: new UUID("recording-1"),
  cover: Cover.create({ path: "cover.png" }, new UUID("cover-1")),
  tags: Tags.create([title("fps")]),
  aliases: ["clutch"],
  attempts: 2,
});

describe("Entity", () => {
  it("is the same entity when the ids match, whatever the props", () => {
    const stored = Clip.create(clipProps(), new UUID("clip-1"));
    const edited = Clip.create({ ...clipProps(), attempts: 9 }, new UUID("clip-1"));
    const other = Clip.create(clipProps(), new UUID("clip-2"));

    expect(stored.equals(edited)).toBe(true);
    expect(stored.equals(other)).toBe(false);
    expect(stored.equals(undefined)).toBe(false);
  });

  it("gets a fresh id when none is given", () => {
    const first = Clip.create(clipProps());
    const second = Clip.create(clipProps());

    expect(first.equals(second)).toBe(false);
  });

  it("flattens value objects, ids, owned entities and lists into a plain object", () => {
    const clip = Clip.create(clipProps(), new UUID("clip-1"));

    expect(clip.toObject()).toEqual({
      id: "clip-1",
      title: "Clutch",
      recordingId: "recording-1",
      cover: { id: "cover-1", path: "cover.png" },
      tags: ["fps"],
      aliases: ["clutch"],
      attempts: 2,
    });
  });

  it("clones into the same class with the same typed id, even behind a private constructor", () => {
    const stored = Take.create({ attempts: 2 });

    const edited = stored.clone({ attempts: 3 });

    expect(edited).toBeInstanceOf(Take);
    expect(edited.id).toBeInstanceOf(TakeId);
    expect(edited.id.equals(stored.id)).toBe(true);
    expect(edited.get("attempts")).toBe(3);
    expect(stored.get("attempts")).toBe(2);
  });

  it("gives a clone its own lists, so changing one leaves the other as it was", () => {
    const stored = Clip.create(clipProps(), new UUID("clip-1"));
    stored.get("tags").add(title("clutch"));

    const edited = stored.clone();
    edited.get("tags").add(title("ace"));
    edited.get("aliases").push("ace");

    expect(edited.get("tags")).toBeInstanceOf(Tags);
    expect(
      edited
        .get("tags")
        .getNewItems()
        .map((tag) => tag.value),
    ).toEqual(["clutch", "ace"]);
    expect(
      stored
        .get("tags")
        .getItems()
        .map((tag) => tag.value),
    ).toEqual(["fps", "clutch"]);
    expect(stored.get("aliases")).toEqual(["clutch"]);
  });
});

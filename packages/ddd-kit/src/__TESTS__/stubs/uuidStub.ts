import { UUID } from "../../primitives/uuid";

export class StubId extends UUID<string> {
  protected [Symbol.toStringTag] = "StubId";

  private constructor(id: UUID<string>) {
    super(id.value);
  }
  public static create(id: UUID<string>): StubId {
    return new StubId(id);
  }
}

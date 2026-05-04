import { z } from "zod";
import { Result } from "../primitives/result";
import { ValueObject } from "./value-object";

const userIdSchema = z.uuid();

export class UserId extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = userIdSchema.safeParse(value);
    if (!parsed.success) return Result.fail(parsed.error.issues[0]?.message ?? "Invalid UserId");

    return Result.ok(parsed.data);
  }
}

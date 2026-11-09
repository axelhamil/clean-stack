import { type PayloadParser, Result } from "@packages/ddd-kit";
import type { z } from "zod";

export function payloadParser<S extends z.ZodType>(schema: S): PayloadParser<z.output<S>> {
  return (payload) => {
    const parsed = schema.safeParse(payload);

    if (parsed.success) return Result.ok(parsed.data);

    const issues = parsed.error.issues.map(
      (issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.code}`,
    );

    return Result.fail(issues.join(", "));
  };
}

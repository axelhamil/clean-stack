import { z } from "zod";

/** `.env.example` ships optional keys as `KEY=`, which Vite reads as "" rather than absent. */
export function blankAsAbsent<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

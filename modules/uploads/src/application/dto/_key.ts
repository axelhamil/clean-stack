import { z } from "zod";

export const keySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "invalid key characters")
  .refine((v) => !v.includes(".."), "key must not contain .. segments")
  .refine((v) => !v.includes("//"), "key must not contain consecutive slashes");

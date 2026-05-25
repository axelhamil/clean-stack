import { z } from "zod";
import { keySchema } from "./_key";

export const deleteUploadBodySchema = z.object({
  key: keySchema,
});

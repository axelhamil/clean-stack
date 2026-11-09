import { z } from "zod";
import { keySchema } from "./_key";

export const deleteUploadBodySchema = z.union([
  z.object({ key: keySchema }),
  z.object({ url: z.url() }),
]);

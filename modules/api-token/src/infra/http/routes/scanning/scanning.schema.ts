import { z } from "zod";

export const githubSignatureHeadersSchema = z.object({
  "github-public-key-identifier": z.string().optional(),
  "github-public-key-signature": z.string().optional(),
});

export const scanPayloadSchema = z.array(
  z.object({ token: z.string(), type: z.string(), url: z.string().optional() }),
);

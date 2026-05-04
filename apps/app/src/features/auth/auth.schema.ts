import { z } from "zod";

export const emailRequestSchema = z.object({ email: z.email() });
export type EmailRequestInput = z.infer<typeof emailRequestSchema>;

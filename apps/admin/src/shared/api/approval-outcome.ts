import { z } from "zod";

const awaitingSchema = z.object({ approvalId: z.string() });

export async function approvalIdOf(res: {
  status: number;
  json: () => Promise<unknown>;
}): Promise<string | null> {
  if (res.status !== 202) return null;

  return awaitingSchema.parse(await res.json()).approvalId;
}

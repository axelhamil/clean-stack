import { z } from "zod";

export const portalHeadersSchema = z.object({
  origin: z.string().optional(),
});

type PortalHeaders = z.output<typeof portalHeadersSchema>;

export type PortalHeadersValidation = { out: { header: PortalHeaders } };

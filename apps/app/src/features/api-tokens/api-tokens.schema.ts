import { z } from "zod";

export const API_SCOPES = ["read:profile", "write:profile", "read:organizations"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const EXPIRY_OPTIONS = [
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
  { label: "No expiry", value: null },
] as const;

export const tokenFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  scopes: z.array(z.enum(API_SCOPES)).min(1, "Select at least one scope"),
  organizationId: z.string().nullable(),
  expiresInDays: z.number().int().positive().nullable(),
});

export type TokenFormInput = z.infer<typeof tokenFormSchema>;

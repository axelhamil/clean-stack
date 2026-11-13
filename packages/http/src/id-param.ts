import { z } from "zod";

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, "Not a valid id.");

export const idParamSchema = z.object({ id: idSchema });

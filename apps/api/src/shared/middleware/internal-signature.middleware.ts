import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { env } from "../env";
import {
  canonicalize,
  MAX_AGE_SECONDS,
  parseSignatureHeader,
  SIGNATURE_HEADER,
  sign,
  verify,
} from "../internal-signature";

export const requireInternalSignature = createMiddleware(async (c, next) => {
  const key = env.INTERNAL_SIGNING_KEY;
  if (!key) throw new HTTPException(503, { message: "Internal signing not configured" });

  const headerValue = c.req.header(SIGNATURE_HEADER);
  if (!headerValue) throw new HTTPException(401, { message: "Missing signature" });

  const parsed = parseSignatureHeader(headerValue);
  if (!parsed) throw new HTTPException(401, { message: "Malformed signature" });

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parsed.t) > MAX_AGE_SECONDS)
    throw new HTTPException(401, { message: "Signature expired" });

  const rawBody = await c.req.raw.clone().text();

  const message = canonicalize({
    timestamp: parsed.t,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    host: c.req.header("host") ?? "",
    contentType: c.req.header("content-type") ?? null,
    rawBody,
  });

  if (!verify(parsed.v1, await sign(message, key)))
    throw new HTTPException(401, { message: "Invalid signature" });

  await next();
});

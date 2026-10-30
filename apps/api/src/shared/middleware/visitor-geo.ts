import type { Context } from "hono";
import { type IIpGeoService, UNKNOWN_VISITOR, type VisitorGeo } from "../ports/ip-geo.port";
import { isFromTrustedProxy } from "./rate-limit.ip";

export function resolveVisitorGeo(c: Context, geo: IIpGeoService): VisitorGeo {
  if (!isFromTrustedProxy(c)) return UNKNOWN_VISITOR;

  return geo.resolve(c.req.raw.headers);
}

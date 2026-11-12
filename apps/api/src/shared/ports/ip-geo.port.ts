import { type AppError, Option } from "@packages/ddd-kit";

export interface VisitorGeo {
  country: Option<string>;
  asn: Option<string>;
}

export type GeoDeniedError = AppError<"SECURITY_GEO_FORBIDDEN">;

export const UNKNOWN_VISITOR: VisitorGeo = { country: Option.none(), asn: Option.none() };

export interface IIpGeoService {
  resolve(headers: Headers): VisitorGeo;
}

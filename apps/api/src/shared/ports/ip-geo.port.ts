import { Option } from "@packages/ddd-kit";

export interface VisitorGeo {
  country: Option<string>;
  asn: Option<string>;
}

export const UNKNOWN_VISITOR: VisitorGeo = { country: Option.none(), asn: Option.none() };

export interface IIpGeoService {
  resolve(headers: Headers): VisitorGeo;
}

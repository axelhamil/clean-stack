import { Option } from "@packages/ddd-kit";
import type { IIpGeoService, VisitorGeo } from "../ports/ip-geo.port";

const COUNTRY = /^[A-Z][A-Z0-9]$/;
const UNKNOWN_COUNTRY = "XX";
const ASN = /^(?:AS)?(\d{1,10})$/;

export function normalizeCountry(raw: string): Option<string> {
  const country = raw.trim().toUpperCase();
  if (!COUNTRY.test(country) || country === UNKNOWN_COUNTRY) return Option.none();

  return Option.some(country);
}

export function normalizeAsn(raw: string): Option<string> {
  return Option.fromNullable(ASN.exec(raw.trim().toUpperCase())?.[1]);
}

export interface IpGeoHeaders {
  countryHeader?: string;
  asnHeader?: string;
}

export class HeaderIpGeoService implements IIpGeoService {
  constructor(private readonly config: IpGeoHeaders) {}

  resolve(headers: Headers): VisitorGeo {
    const read = (name?: string) => Option.fromNullable(name ? headers.get(name) : null);

    return {
      country: read(this.config.countryHeader).flatMap(normalizeCountry),
      asn: read(this.config.asnHeader).flatMap(normalizeAsn),
    };
  }
}

import type { Option } from "@packages/ddd-kit";

export interface ApiTokenSettings {
  prefix: string;
  pepper: string;
  pepperVersion: number;
  pepperPrevious: Option<string>;
  maxExpiryDays: number;
}

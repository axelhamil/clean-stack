import type { ConsentCategory } from "@packages/cookie-consent";
import type { Option } from "@packages/ddd-kit";

export interface RecordConsentInput {
  subjectId: Option<string>;
  userId: Option<string>;
  categories: ConsentCategory[];
  ipAddress: Option<string>;
  userAgent: Option<string>;
}

export interface RecordConsentOutput {
  subjectId: string;
  categories: ConsentCategory[];
  policyVersion: string;
}

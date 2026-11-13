import type { Option } from "@packages/ddd-kit";

export interface WithdrawConsentInput {
  subjectId: string;
  userId: Option<string>;
}

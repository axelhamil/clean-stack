import type { IQuery, Option } from "@packages/ddd-kit";
import type { ConsentError, ConsentRecord } from "../ports/repositories/consent.port";

export interface GetActiveConsentInput {
  subjectId: string;
  userId: Option<string>;
}

export type IGetActiveConsentQuery = IQuery<
  GetActiveConsentInput,
  Option<ConsentRecord>,
  ConsentError
>;

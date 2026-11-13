import type { IQuery, Option } from "@packages/ddd-kit";
import type { StepUpStoreError } from "../ports/repositories/step-up-store.port";

export type IStepUpValidityQuery = IQuery<{ sessionId: string }, Option<Date>, StepUpStoreError>;

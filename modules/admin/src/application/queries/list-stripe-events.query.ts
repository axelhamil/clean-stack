import type { IQuery } from "@packages/ddd-kit";
import type {
  StripeEventRow,
  StripeEventStoreError,
} from "../ports/repositories/stripe-event.port";

export interface StripeEventList {
  configured: boolean;
  items: StripeEventRow[];
}

export type IListStripeEventsQuery = IQuery<void, StripeEventList, StripeEventStoreError>;

import type { IQuery } from "@packages/ddd-kit";
import type {
  DeadOutboxPage,
  DeadQueueCounts,
  OpsStoreError,
} from "../ports/repositories/ops-store.port";

export interface DeadLetters {
  outbox: DeadOutboxPage;
  queues: DeadQueueCounts;
}

export type IListDeadLettersQuery = IQuery<void, DeadLetters, OpsStoreError>;

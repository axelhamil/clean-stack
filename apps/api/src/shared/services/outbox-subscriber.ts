import type { Transaction } from "@packages/drizzle";
import type { OutboxRecord } from "../ports/outbox.port";

export interface OutboxSubscriber {
  readonly name: string;
  handle(event: OutboxRecord, tx: Transaction): Promise<void>;
}

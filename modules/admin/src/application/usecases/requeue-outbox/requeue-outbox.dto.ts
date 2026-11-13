export interface RequeueOutboxInput {
  actorUserId: string;
  ids: string[];
}

export interface RequeueOutboxOutput {
  requeued: number;
}

export interface RequeueOutboxConfig {
  OUTBOX_LEASE_SECONDS: number;
}

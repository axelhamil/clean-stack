import { EventTypes, type UploadDeletedPayload } from "@packages/events";
import type { z } from "zod";
import { hashKey } from "../services/upload-policy.service";

export interface UploadDeleted {
  ownerId: string;
  key: string;
}

export async function uploadDeletedEvent(fact: UploadDeleted) {
  const hashedKey = await hashKey(fact.key);
  const payload: z.infer<typeof UploadDeletedPayload> = { userId: fact.ownerId, key: hashedKey };

  return {
    type: EventTypes.UPLOAD_DELETED,
    aggregateType: "upload",
    aggregateId: hashedKey,
    payload,
  };
}

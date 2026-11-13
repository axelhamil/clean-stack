import { EventTypes, type UploadRequestedPayload } from "@packages/events";
import type { z } from "zod";
import { hashKey } from "../services/upload-policy.service";

export interface UploadRequested {
  ownerId: string;
  key: string;
  contentType: string;
  size: number;
}

export async function uploadRequestedEvent(fact: UploadRequested) {
  const hashedKey = await hashKey(fact.key);
  const payload: z.infer<typeof UploadRequestedPayload> = {
    userId: fact.ownerId,
    key: hashedKey,
    contentType: fact.contentType,
    size: fact.size,
  };

  return {
    type: EventTypes.UPLOAD_REQUESTED,
    aggregateType: "upload",
    aggregateId: hashedKey,
    payload,
  };
}

import { EventTypes, type UploadConfirmedPayload } from "@packages/events";
import type { z } from "zod";
import { hashKey } from "../services/upload-policy.service";

export interface UploadConfirmed {
  ownerId: string;
  key: string;
  size: number;
  contentType: string;
}

export async function uploadConfirmedEvent(fact: UploadConfirmed) {
  const hashedKey = await hashKey(fact.key);
  const payload: z.infer<typeof UploadConfirmedPayload> = {
    userId: fact.ownerId,
    key: hashedKey,
    size: fact.size,
    contentType: fact.contentType,
  };

  return {
    type: EventTypes.UPLOAD_CONFIRMED,
    aggregateType: "upload",
    aggregateId: hashedKey,
    payload,
  };
}

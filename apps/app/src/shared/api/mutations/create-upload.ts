import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { api } from "../api-client";

const $presign = api.uploads.presign.$post;
const $confirm = api.uploads.confirm.$post;

type PresignBody = InferRequestType<typeof $presign>["json"];
type ConfirmResponse = InferResponseType<typeof $confirm, 200>;

export interface CreateUploadInput {
  file: File;
  scope?: PresignBody["scope"];
  expiresInSeconds?: PresignBody["expiresInSeconds"];
}

async function createUpload({
  file,
  scope,
  expiresInSeconds,
}: CreateUploadInput): Promise<ConfirmResponse> {
  const contentType = file.type || "application/octet-stream";

  const presignRes = await $presign({
    json: {
      filename: file.name,
      contentType,
      size: file.size,
      ...(scope ? { scope } : {}),
      ...(expiresInSeconds ? { expiresInSeconds } : {}),
    },
  });
  if (!presignRes.ok) throw new Error(`Presign failed: HTTP ${presignRes.status}`);
  const presigned = await presignRes.json();

  const putRes = await fetch(presigned.url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.size),
    },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Upload failed: HTTP ${putRes.status}`);

  const confirmRes = await $confirm({
    json: {
      key: presigned.key,
      expectedSize: presigned.expectedSize,
      expectedContentType: presigned.expectedContentType,
    },
  });
  if (!confirmRes.ok) throw new Error(`Confirm failed: HTTP ${confirmRes.status}`);

  return await confirmRes.json();
}

export const createUploadMutationOptions = mutationOptions({
  mutationKey: ["uploads", "create"] as const,
  mutationFn: createUpload,
});

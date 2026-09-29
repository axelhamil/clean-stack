import { describe, expect, it, vi } from "vitest";

const presign = vi.fn();

vi.mock("../../api-client", () => ({
  api: {
    uploads: { presign: { $post: () => presign() }, confirm: { $post: vi.fn() }, $delete: vi.fn() },
  },
}));

import { isUnexpectedMutationError } from "../../../observability/error-classifier";
import { createUpload } from "../create-upload";

describe("createUpload", () => {
  // A refused presign used to become `new Error("Presign failed: HTTP 413")`:
  // the code was lost for the catalog and the 4xx reached telemetry.
  it("rejects a refused presign with its status and code", async () => {
    presign.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "UPLOAD_TOO_LARGE", message: "too big" } }), {
        status: 413,
      }),
    );
    const file = new File(["x"], "avatar.png", { type: "image/png" });

    const err = await createUpload({ file }).catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 413, code: "UPLOAD_TOO_LARGE" });
    expect(isUnexpectedMutationError(err)).toBe(false);
  });

  it("falls back to the catalog copy when the refusal has no JSON body", async () => {
    presign.mockResolvedValue(new Response(null, { status: 502 }));
    const file = new File(["x"], "avatar.png", { type: "image/png" });

    const err = await createUpload({ file }).catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 502, message: "Failed to prepare the upload" });
  });
});

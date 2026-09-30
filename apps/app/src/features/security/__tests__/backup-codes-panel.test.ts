import { afterEach, describe, expect, it, vi } from "vitest";
import { copyRecoveryCodes } from "../components/backup-codes-panel";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  vi.stubGlobal("navigator", { clipboard: { writeText } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copyRecoveryCodes", () => {
  it("writes one code per line, then confirms", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const onCopied = vi.fn();
    stubClipboard(writeText);

    await copyRecoveryCodes(["aaaa-bbbb", "cccc-dddd"], onCopied);

    expect(writeText).toHaveBeenCalledWith("aaaa-bbbb\ncccc-dddd");
    expect(onCopied).toHaveBeenCalledOnce();
  });

  // The panel used to fire the "copied" toast without awaiting the write, so a
  // denied clipboard permission still told the user their codes were saved.
  it("does not confirm when the clipboard write is rejected", async () => {
    const onCopied = vi.fn();
    stubClipboard(() => Promise.reject(new Error("denied")));

    await expect(copyRecoveryCodes(["aaaa-bbbb"], onCopied)).rejects.toThrow("denied");
    expect(onCopied).not.toHaveBeenCalled();
  });
});

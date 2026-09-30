import { CopyableValue } from "@packages/ui/components/ui/copyable-value";
import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The app runs vitest without a DOM, so the copy button is reached by walking
 * the element tree `CopyableValue` returns (it calls no hook) and invoking the
 * handler it wires, which is what a click does.
 */
function findCopyHandler(node: ReactNode): (() => void) | undefined {
  if (!isValidElement<{ onClick?: () => void; children?: ReactNode }>(node)) return undefined;
  if (node.props.onClick) return node.props.onClick;

  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];

  for (const child of children) {
    const handler = findCopyHandler(child);
    if (handler) return handler;
  }

  return undefined;
}

function clickCopy(onCopied: () => void) {
  const tree = CopyableValue({ value: "secret", copyLabel: "Copy", onCopied });
  const copy = findCopyHandler(tree);
  if (!copy) throw new Error("CopyableValue rendered no copy handler");

  copy();
}

describe("CopyableValue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not confirm the copy while the clipboard write is still pending", () => {
    const writeText = vi.fn(() => new Promise<void>(() => {}));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();

    clickCopy(onCopied);

    expect(writeText).toHaveBeenCalledWith("secret");
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("confirms the copy once the clipboard write succeeds", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => Promise.resolve()) } });
    const onCopied = vi.fn();

    clickCopy(onCopied);
    await vi.waitFor(() => expect(onCopied).toHaveBeenCalledOnce());
  });
});

import { describe, expect, it } from "vitest";
import { SUB_PROCESSOR_KEYS } from "../../../shared/sub-processor-labels";
import { SUB_PROCESSORS } from "../../../shared/sub-processors.config";

describe("SUB_PROCESSOR_KEYS", () => {
  // `satisfies Record<SubProcessorId, …>` proves every id has a pair of keys.
  // It cannot prove Resend's row points at Resend's copy — swapping two entries
  // type-checks and renders. Only naming each pair catches that.
  it("points each processor at its own purpose and region keys", () => {
    expect(SUB_PROCESSOR_KEYS).toStrictEqual({
      resend: {
        purpose: "privacy.dataSources.processors.resend.purpose",
        region: "privacy.dataSources.processors.resend.region",
      },
      r2: {
        purpose: "privacy.dataSources.processors.r2.purpose",
        region: "privacy.dataSources.processors.r2.region",
      },
      betterAuth: {
        purpose: "privacy.dataSources.processors.betterAuth.purpose",
        region: "privacy.dataSources.processors.betterAuth.region",
      },
      stripe: {
        purpose: "privacy.dataSources.processors.stripe.purpose",
        region: "privacy.dataSources.processors.stripe.region",
      },
      umami: {
        purpose: "privacy.dataSources.processors.umami.purpose",
        region: "privacy.dataSources.processors.umami.region",
      },
    });
  });

  // The register and the key map are two files that must gain entries together.
  // A vendor added to the register with no keys would render blank cells.
  it("covers every processor in the register, with no orphan entry", () => {
    expect(Object.keys(SUB_PROCESSOR_KEYS).toSorted()).toEqual(
      SUB_PROCESSORS.map((sp) => sp.id).toSorted(),
    );
  });
});

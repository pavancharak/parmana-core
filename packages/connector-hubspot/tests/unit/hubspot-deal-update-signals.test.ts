import { describe, expect, it } from "vitest";

import {
  HUBSPOT_DEFAULT_STAGE_ORDER,
  buildHubSpotDealUpdateSignals,
  isHubSpotStageTransitionAllowed,
  type HubSpotDeal,
} from "../../src/index.js";

function deal(overrides: Partial<HubSpotDeal["properties"]> = {}): HubSpotDeal {
  return {
    id: "1001",
    properties: {
      dealstage: "appointmentscheduled",
      amount: "5000",
      pipeline: "default",
      ...overrides,
    },
  };
}

describe("isHubSpotStageTransitionAllowed", () => {
  it("allows a no-op (same stage)", () => {
    expect(
      isHubSpotStageTransitionAllowed("qualifiedtobuy", "qualifiedtobuy"),
    ).toBe(true);
  });

  it("allows a single forward step", () => {
    expect(
      isHubSpotStageTransitionAllowed("appointmentscheduled", "qualifiedtobuy"),
    ).toBe(true);
  });

  it("allows skipping forward multiple stages", () => {
    expect(
      isHubSpotStageTransitionAllowed("appointmentscheduled", "contractsent"),
    ).toBe(true);
  });

  it("denies a backward step", () => {
    expect(
      isHubSpotStageTransitionAllowed("contractsent", "qualifiedtobuy"),
    ).toBe(false);
  });

  it("allows moving to closedlost from any active stage", () => {
    for (const stage of HUBSPOT_DEFAULT_STAGE_ORDER.slice(0, -1)) {
      expect(isHubSpotStageTransitionAllowed(stage, "closedlost")).toBe(true);
    }
  });

  it("denies any transition out of closedwon (terminal)", () => {
    expect(isHubSpotStageTransitionAllowed("closedwon", "qualifiedtobuy")).toBe(
      false,
    );
    expect(isHubSpotStageTransitionAllowed("closedwon", "closedlost")).toBe(
      false,
    );
  });

  it("denies any transition out of closedlost (terminal)", () => {
    expect(
      isHubSpotStageTransitionAllowed("closedlost", "qualifiedtobuy"),
    ).toBe(false);
    expect(isHubSpotStageTransitionAllowed("closedlost", "closedwon")).toBe(
      false,
    );
  });

  it("denies a transition to or from an unrecognized stage id", () => {
    expect(
      isHubSpotStageTransitionAllowed(
        "appointmentscheduled",
        "some-custom-stage",
      ),
    ).toBe(false);
    expect(
      isHubSpotStageTransitionAllowed("some-custom-stage", "qualifiedtobuy"),
    ).toBe(false);
  });
});

describe("buildHubSpotDealUpdateSignals", () => {
  it("treats a no-op stage (unchanged) as trivially allowed and not a change", () => {
    const signals = buildHubSpotDealUpdateSignals({
      currentDeal: deal({ dealstage: "qualifiedtobuy" }),
      proposedDealStage: "qualifiedtobuy",
    });
    expect(signals.dealStageChangeRequested).toBe(false);
    expect(signals.dealStageTransitionAllowed).toBe(true);
  });

  it("computes amountDeltaAbs and the threshold comparison", () => {
    const signals = buildHubSpotDealUpdateSignals({
      currentDeal: deal({ amount: "5000" }),
      proposedAmount: 16_000,
      amountChangeThreshold: 10_000,
    });
    expect(signals.amountChangeRequested).toBe(true);
    expect(signals.amountDeltaAbs).toBe(11_000);
    expect(signals.amountChangeExceedsThreshold).toBe(true);
  });

  it("defaults preAuthorizedForAmountChange to false when not supplied", () => {
    const signals = buildHubSpotDealUpdateSignals({
      currentDeal: deal(),
      proposedAmount: 5001,
    });
    expect(signals.preAuthorizedForAmountChange).toBe(false);
  });

  it("omits proposedDealStage/proposedAmount from signals when not requested, matching an absent Intent field for boundSignals", () => {
    const signals = buildHubSpotDealUpdateSignals({ currentDeal: deal() });
    expect("proposedDealStage" in signals).toBe(false);
    expect("proposedAmount" in signals).toBe(false);
  });
});

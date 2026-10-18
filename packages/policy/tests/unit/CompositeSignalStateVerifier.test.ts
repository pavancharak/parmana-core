import { describe, expect, it, vi } from "vitest";

import { CompositeSignalStateVerifier } from "../../src/CompositeSignalStateVerifier.js";
import type {
  SignalStateVerificationRequest,
  SignalStateVerifier,
  SignalStateViolation,
} from "../../src/types/SignalStateVerifier.js";

/**
 * The composite runs every signal state verifier (approvals, external
 * state checks) the server wires in. Mutation testing found it untested
 * in this package: a version that always reported "no violations" passed
 * every test here.
 */

const request = { action: "a" } as unknown as SignalStateVerificationRequest;
const violation = (signalKey: string): SignalStateViolation => ({
  signalKey,
  declaredValue: true,
  actualValue: false,
});
const verifier = (
  violations: readonly SignalStateViolation[],
): SignalStateVerifier & { findViolations: ReturnType<typeof vi.fn> } => ({
  findViolations: vi.fn(async () => violations),
});

describe("CompositeSignalStateVerifier", () => {
  it("reports nothing when every verifier reports nothing", async () => {
    const all = [verifier([]), verifier([])];
    expect(
      await new CompositeSignalStateVerifier(all).findViolations(request, {}),
    ).toEqual([]);
    for (const v of all) expect(v.findViolations).toHaveBeenCalledOnce();
  });

  it("returns the first verifier's violations and stops there", async () => {
    const first = verifier([violation("managerApproved")]);
    const second = verifier([violation("other")]);
    expect(
      await new CompositeSignalStateVerifier([first, second]).findViolations(
        request,
        {},
      ),
    ).toEqual([violation("managerApproved")]);
    expect(second.findViolations).not.toHaveBeenCalled();
  });

  it("reports a later verifier's violations when earlier ones pass", async () => {
    const later = verifier([violation("channelAuthorized")]);
    expect(
      await new CompositeSignalStateVerifier([
        verifier([]),
        later,
      ]).findViolations(request, { channelAuthorized: true }),
    ).toEqual([violation("channelAuthorized")]);
    expect(later.findViolations).toHaveBeenCalledWith(request, {
      channelAuthorized: true,
    });
  });

  it("reports nothing with no verifiers", async () => {
    expect(
      await new CompositeSignalStateVerifier([]).findViolations(request, {}),
    ).toEqual([]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PolicyEngine,
  PolicyRouter,
  SignalIntentBinder,
  type PolicyRepository,
  type Policy,
} from "@parmana/policy";

import { DecisionBuilder } from "../../src/DecisionBuilder.js";
import { ExecutionBuilder } from "../../src/ExecutionBuilder.js";
import { ExecutionGate } from "../../src/ExecutionGate.js";
import { RuntimeAuthorizationSigner } from "../../src/RuntimeAuthorizationSigner.js";
import { RuntimeEngine } from "../../src/RuntimeEngine.js";
import { RuntimePipeline } from "../../src/RuntimePipeline.js";
import { BusinessTrustPipeline } from "../../src/BusinessTrustPipeline.js";

/**
 * Gap #2: RuntimeEngine's constructor previously never logged which
 * optional protections (signalStateVerifier, capabilityPolicyBinder,
 * refusal recording) were wired for a given instance -- an operator
 * reading logs had no way to tell. This is construction-time-only,
 * additive observability; it changes no behavior.
 */
class UnusedPolicyRepository implements PolicyRepository {
  async load(): Promise<Policy> {
    throw new Error("not used in this test");
  }

  async save(): Promise<void> {
    throw new Error("not used in this test");
  }
}

function buildRequiredArgs() {
  return [
    new RuntimePipeline([]),
    new PolicyRouter(new UnusedPolicyRepository()),
    new PolicyEngine(),
    new SignalIntentBinder(),
    new DecisionBuilder(),
    new ExecutionGate(),
    new ExecutionBuilder(),
    new BusinessTrustPipeline(),
    new RuntimeAuthorizationSigner(),
    120,
  ] as const;
}

describe("RuntimeEngine optional-protections logging", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("logs both optional protections as false when neither is configured", () => {
    new RuntimeEngine(...buildRequiredArgs());

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "runtime_engine_constructed",
        signalStateVerifierConfigured: false,
        capabilityPolicyBinderConfigured: false,
        policyExecutionVerifierConfigured: false,
        refusalRecordingConfigured: false,
      }),
    );
  });

  it("logs signalStateVerifierConfigured true when only that protection is supplied", () => {
    const signalStateVerifier = { findViolations: async () => [] };

    new RuntimeEngine(
      ...buildRequiredArgs(),
      [],
      undefined,
      undefined,
      signalStateVerifier as never,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "runtime_engine_constructed",
        signalStateVerifierConfigured: true,
        capabilityPolicyBinderConfigured: false,
        policyExecutionVerifierConfigured: false,
        refusalRecordingConfigured: false,
      }),
    );
  });

  it("logs capabilityPolicyBinderConfigured true when only that protection is supplied", () => {
    const capabilityPolicyBinder = { findViolation: () => undefined };

    new RuntimeEngine(
      ...buildRequiredArgs(),
      [],
      undefined,
      undefined,
      undefined,
      capabilityPolicyBinder as never,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "runtime_engine_constructed",
        signalStateVerifierConfigured: false,
        capabilityPolicyBinderConfigured: true,
        policyExecutionVerifierConfigured: false,
        refusalRecordingConfigured: false,
      }),
    );
  });

  it("logs policyExecutionVerifierConfigured true when only that protection is supplied", () => {
    const policyExecutionVerifier = { verify: async () => undefined };

    new RuntimeEngine(
      ...buildRequiredArgs(),
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      policyExecutionVerifier as never,
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "runtime_engine_constructed",
        signalStateVerifierConfigured: false,
        capabilityPolicyBinderConfigured: false,
        policyExecutionVerifierConfigured: true,
        refusalRecordingConfigured: false,
      }),
    );
  });
});

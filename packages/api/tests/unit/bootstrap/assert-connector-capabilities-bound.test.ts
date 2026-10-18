import { afterEach, describe, expect, it, vi } from "vitest";

import { connectorCapabilities } from "@parmana/connector-sdk";

import {
  assertConnectorCapabilitiesBound,
  type CapabilityBoundConnectorRegistration,
} from "../../../src/bootstrap/assertConnectorCapabilitiesBound.js";
import { INTENTIONALLY_UNBOUND_CAPABILITIES } from "../../../src/bootstrap/intentionallyUnboundCapabilities.js";

function registration(
  connectorId: string,
  capabilities: readonly string[],
): CapabilityBoundConnectorRegistration {
  return {
    connectorIdentity: { connectorId },
    connector: { capabilities: connectorCapabilities(capabilities) },
  };
}

describe("assertConnectorCapabilitiesBound", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes silently for capabilities with a canonical binding", () => {
    expect(() =>
      assertConnectorCapabilitiesBound([
        registration("hubspot", ["hubspot:deal-fetch", "hubspot:deal-update"]),
        registration("github", ["github:pr-fetch", "github:pr-merge"]),
      ]),
    ).not.toThrow();
  });

  it("passes, with a warning, for an allowlisted-but-unbound capability", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(() =>
      assertConnectorCapabilitiesBound([
        registration("test-fixture", ["test:fixture-execute"]),
      ]),
    ).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "connector_capability_intentionally_unbound",
        capability: "test:fixture-execute",
        connectorId: "test-fixture",
      }),
    );
  });

  it("(fail-closed) throws for a registered capability that is neither bound nor allowlisted", () => {
    expect(() =>
      assertConnectorCapabilitiesBound([
        registration("future-connector", ["database:apply-migration"]),
      ]),
    ).toThrow(
      /Connector capability "database:apply-migration".*is registered but has no entry/s,
    );
  });

  it("every INTENTIONALLY_UNBOUND_CAPABILITIES entry carries a non-empty reason", () => {
    for (const [capability, reason] of INTENTIONALLY_UNBOUND_CAPABILITIES) {
      expect(
        reason.trim().length,
        `capability "${capability}"`,
      ).toBeGreaterThan(0);
    }
  });
});

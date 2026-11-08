import { CryptoBootstrap } from "@parmana/crypto";
import { describe, expect, it } from "vitest";

import type {
  ConnectorRequest,
  ConnectorResponse,
} from "@parmana/connector-sdk";

import { buildConnectorEvidence } from "../../src/connector-execution/index.js";

/**
 * F28-7 step 4: the condition evidence an endpoint reported is bound into the connector evidence,
 * and so into the hash the Execution Trust Record anchors. Changing the evidence changes the hash.
 */

const crypto = CryptoBootstrap.create();

const request: ConnectorRequest = {
  capability: "erp:release-goods",
  businessTransactionId: "bt-7",
  action: "erp:release-goods",
  target: "invoices/INV-1",
  parameters: { invoiceId: "INV-1" },
};

function response(
  evidence: Record<string, string | number | boolean | null>,
): ConnectorResponse {
  return {
    success: true,
    metadata: {
      status: 200,
      conditionsChecked: [
        {
          signalKey: "invoicePaid",
          atomicity: "check-then-act",
          outcome: "holds",
          evidence,
        },
      ],
    },
  };
}

function build(evidence: Record<string, string | number | boolean | null>) {
  return buildConnectorEvidence({
    connectorId: "erp",
    connectorVersion: { major: 1, minor: 0, patch: 0 },
    credentialProviderId: "static",
    request,
    response: response(evidence),
    startedAt: new Date("2026-10-11T10:00:00.000Z"),
    completedAt: new Date("2026-10-11T10:00:01.000Z"),
    crypto,
  });
}

describe("condition evidence binding (F28-7, step 4)", () => {
  it("carries the endpoint's condition evidence, verbatim, into the connector evidence", async () => {
    const evidence = await build({
      status: "paid",
      amount: 1000,
      observedAt: "2026-10-11T10:00:00.500Z",
    });
    expect(evidence.responseSummary.metadata.conditionsChecked).toEqual([
      {
        signalKey: "invoicePaid",
        atomicity: "check-then-act",
        outcome: "holds",
        evidence: {
          status: "paid",
          amount: 1000,
          observedAt: "2026-10-11T10:00:00.500Z",
        },
      },
    ]);
  });

  it("binds the evidence into the hash: changing the observed value changes the hash", async () => {
    const paid = await build({ status: "paid", amount: 1000 });
    const unpaid = await build({ status: "unpaid", amount: 1000 });
    expect(paid.connectorEvidenceHash).not.toBe(unpaid.connectorEvidenceHash);
  });

  it("gives identical evidence an identical hash, so the binding is reproducible", async () => {
    const first = await build({ status: "paid", amount: 1000 });
    const second = await build({ status: "paid", amount: 1000 });
    expect(first.connectorEvidenceHash).toBe(second.connectorEvidenceHash);
  });
});

import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "../../src/domain/execution-trust-record.js";
import { reconcileExecutionEvidence } from "../../src/domain/execution-reconciliation.js";

function record(id: string, nonce: string | undefined): ExecutionTrustRecord {
  return {
    trustRecordId: id,
    ...(nonce !== undefined && {
      authorization: { payload: { nonce } },
    }),
  } as unknown as ExecutionTrustRecord;
}

describe("reconcileExecutionEvidence (CE-04)", () => {
  it("passes when every completed execution has a trust record", () => {
    const report = reconcileExecutionEvidence(
      [{ nonce: "n1", status: "completed" }],
      [record("tr-1", "n1")],
    );

    expect(report.status).toBe("passed");
    expect(report.missingEvidence).toEqual([]);
  });

  it("fails when a completed execution's trust record has been removed", () => {
    const report = reconcileExecutionEvidence(
      [
        { nonce: "n1", status: "completed" },
        { nonce: "n2", status: "completed" },
      ],
      [record("tr-1", "n1")],
    );

    expect(report.status).toBe("failed");
    expect(report.missingEvidence).toEqual(["n2"]);
  });

  it("reports not checked when no outcomes are supplied, never passed", () => {
    expect(reconcileExecutionEvidence([], []).status).toBe("not_checked");
  });

  it("reports not checked while an execution is still in flight", () => {
    const report = reconcileExecutionEvidence(
      [{ nonce: "n1", status: "in_flight" }],
      [],
    );

    expect(report.status).toBe("not_checked");
    expect(report.inFlight).toEqual(["n1"]);
  });

  it("does not require a record for a failed refusal", () => {
    const report = reconcileExecutionEvidence(
      [{ nonce: "n1", status: "failed" }],
      [],
    );

    expect(report.status).toBe("passed");
  });

  it("reports records that match no outcome for review, without failing", () => {
    const report = reconcileExecutionEvidence(
      [{ nonce: "n1", status: "completed" }],
      [record("tr-1", "n1"), record("tr-orphan", "n-other")],
    );

    expect(report.status).toBe("passed");
    expect(report.unmatchedRecordIds).toContain("tr-orphan");
  });
});

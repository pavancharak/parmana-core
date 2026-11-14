import { describe, expect, it } from "vitest";

import type { ExecutionTrustRecord } from "@parmana/shared";

import { checkTrustRecordCorrespondenceOffline } from "../../src/ExecutionCorrespondenceOffline.js";

const AUTHORIZED_HASH = "hash-authorized";

function authorization() {
  return {
    payload: {
      nonce: "nonce-1",
      businessTransactionHash: AUTHORIZED_HASH,
      policyContentHash: "policy-hash",
      authorityGrant: { grantId: "grant-1" },
    },
  };
}

function correspondence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    authorizationNonce: "nonce-1",
    authorizedContentHash: AUTHORIZED_HASH,
    dispatchedContentHash: AUTHORIZED_HASH,
    policyContentHash: "policy-hash",
    authorityGrantId: "grant-1",
    ...overrides,
  };
}

function execution(id: string, corr?: Record<string, unknown>) {
  return {
    executionId: id,
    evidence: corr === undefined ? undefined : { correspondence: corr },
  };
}

function record(
  executions: readonly unknown[],
  embedded: boolean = true,
): ExecutionTrustRecord {
  return {
    trustRecordId: "tr-1",
    executions,
    ...(embedded && { authorization: authorization() }),
  } as unknown as ExecutionTrustRecord;
}

describe("checkTrustRecordCorrespondenceOffline", () => {
  it("passes when every execution corresponds to the embedded authorization", () => {
    const report = checkTrustRecordCorrespondenceOffline(
      record([execution("e1", correspondence())]),
    );

    expect(report.status).toBe("passed");
  });

  it("fails when a dispatched hash differs from the authorized hash", () => {
    const report = checkTrustRecordCorrespondenceOffline(
      record([
        execution(
          "e1",
          correspondence({ dispatchedContentHash: "hash-changed" }),
        ),
      ]),
    );

    expect(report.status).toBe("failed");
  });

  it("fails when the record embeds no authorization", () => {
    const report = checkTrustRecordCorrespondenceOffline(
      record([execution("e1", correspondence())], false),
    );

    expect(report.status).toBe("failed");
    expect(JSON.stringify(report)).toContain("no authorization");
  });

  it("reports not checked when the record has no executions", () => {
    expect(checkTrustRecordCorrespondenceOffline(record([])).status).toBe(
      "not_checked",
    );
  });

  it("reports not checked, not passed, for an execution without evidence", () => {
    const report = checkTrustRecordCorrespondenceOffline(
      record([execution("e1")]),
    );

    expect(report.status).toBe("not_checked");
  });

  it("reports not checked, not passed, for evidence without correspondence fields", () => {
    const report = checkTrustRecordCorrespondenceOffline(
      record([execution("e1", undefined)]),
    );

    expect(report.status).toBe("not_checked");
  });

  it("does not report passed when one execution passed and another is unchecked", () => {
    const report = checkTrustRecordCorrespondenceOffline(
      record([execution("e1", correspondence()), execution("e2")]),
    );

    expect(report.status).toBe("not_checked");
  });

  it("reports failed even when another execution is unchecked", () => {
    const report = checkTrustRecordCorrespondenceOffline(
      record([
        execution("e1", correspondence({ dispatchedContentHash: "other" })),
        execution("e2"),
      ]),
    );

    expect(report.status).toBe("failed");
  });
});

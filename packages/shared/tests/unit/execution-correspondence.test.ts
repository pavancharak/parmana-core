import { describe, expect, it } from "vitest";

import {
  checkExecutionCorrespondence,
  type CorrespondenceAuthorization,
} from "../../src/domain/execution-correspondence.js";
import type { ExecutionCorrespondence } from "../../src/domain/execution-evidence.js";

const AUTH: CorrespondenceAuthorization = {
  nonce: "nonce-1",
  businessTransactionHash: "hash-authorized",
  policyContentHash: "policy-hash",
  authorityGrantId: "grant-1",
};

function matching(
  overrides: Partial<ExecutionCorrespondence> = {},
): ExecutionCorrespondence {
  return {
    schemaVersion: 1,
    authorizationNonce: "nonce-1",
    authorizedContentHash: "hash-authorized",
    dispatchedContentHash: "hash-authorized",
    policyContentHash: "policy-hash",
    authorityGrantId: "grant-1",
    ...overrides,
  };
}

describe("checkExecutionCorrespondence", () => {
  it("passes when every field matches the authorization", () => {
    expect(checkExecutionCorrespondence(matching(), AUTH)).toEqual({
      status: "passed",
    });
  });

  it("reports records without correspondence fields as not checked, never passed", () => {
    const result = checkExecutionCorrespondence(undefined, AUTH);

    expect(result.status).toBe("not_checked");
  });

  it("fails when the dispatched content hash differs from the authorized hash", () => {
    const result = checkExecutionCorrespondence(
      matching({ dispatchedContentHash: "hash-other" }),
      AUTH,
    );

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).toContain("dispatched content differs");
  });

  it("fails when the recorded authorized hash differs from the authorization", () => {
    const result = checkExecutionCorrespondence(
      matching({
        authorizedContentHash: "hash-other",
        dispatchedContentHash: "hash-other",
      }),
      AUTH,
    );

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).toContain("authorizedContentHash differs");
  });

  it("fails when the nonce differs", () => {
    const result = checkExecutionCorrespondence(
      matching({ authorizationNonce: "nonce-2" }),
      AUTH,
    );

    expect(result.status).toBe("failed");
  });

  it("fails when the policy content hash differs or is absent", () => {
    expect(
      checkExecutionCorrespondence(
        matching({ policyContentHash: "policy-other" }),
        AUTH,
      ).status,
    ).toBe("failed");

    expect(
      checkExecutionCorrespondence(
        matching({ policyContentHash: undefined }),
        AUTH,
      ).status,
    ).toBe("failed");
  });

  it("fails when the authority grant differs or is absent", () => {
    expect(
      checkExecutionCorrespondence(
        matching({ authorityGrantId: "grant-2" }),
        AUTH,
      ).status,
    ).toBe("failed");
  });

  it("fails closed on empty or missing hashes", () => {
    const empty = checkExecutionCorrespondence(
      matching({ dispatchedContentHash: "" }),
      AUTH,
    );

    expect(empty.status).toBe("failed");
    expect(JSON.stringify(empty)).toContain("dispatchedContentHash is missing");
  });

  it("fails on an unsupported correspondence schema version", () => {
    const result = checkExecutionCorrespondence(
      { ...matching(), schemaVersion: 2 } as unknown as ExecutionCorrespondence,
      AUTH,
    );

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).toContain("unsupported");
  });

  it("does not require policy or grant fields when the authorization has none", () => {
    const bare: CorrespondenceAuthorization = {
      nonce: "nonce-1",
      businessTransactionHash: "hash-authorized",
    };

    expect(
      checkExecutionCorrespondence(
        matching({ policyContentHash: undefined, authorityGrantId: undefined }),
        bare,
      ).status,
    ).toBe("passed");
  });
});

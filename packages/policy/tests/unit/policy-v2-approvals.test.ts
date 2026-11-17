import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ApproverKeys,
  approvalChecker,
  signApproval,
  verifyApproval,
  viewDigest,
  type ApprovalView,
  type SignedApproval,
} from "../../src/v2/approvals.js";
import { MemoryNonceStore } from "../../src/v2/sourceAnswer.js";

/** Tests for informed, exact, single-use approvals (design 4.7; plan step 5). */

const NOW = new Date("2026-11-18T09:00:00.000Z");
const APPROVER = "finance-lead-1";
const KEY_ID = "finance-lead-1-key";

const approverPair = generateKeyPairSync("ed25519");
const otherPair = generateKeyPairSync("ed25519");
const pem = (key: KeyObject) =>
  key.export({ type: "spki", format: "pem" }).toString();

function view(overrides: Partial<ApprovalView> = {}): ApprovalView {
  return {
    capability: "erp:pay-invoice",
    target: "INV-1001",
    values: {
      invoiceAmount: {
        value: 9000,
        provenance: "sourced",
        source: "procurement-system",
        claim: "invoice.amount",
      },
      vendorVerified: {
        value: true,
        provenance: "sourced",
        source: "vendor-master",
        claim: "vendor.verified",
      },
      riskScore: { value: 10, provenance: "untrusted" },
    },
    missing: [],
    callerReason: "Invoice due this week.",
    ...overrides,
  };
}

function approversWith(keys: { revoked?: boolean } = {}): ApproverKeys {
  const approvers = new ApproverKeys();
  approvers.register(APPROVER, KEY_ID, pem(approverPair.publicKey));
  if (keys.revoked) approvers.revoke(APPROVER, KEY_ID);
  return approvers;
}

/** Signs an approval the way the console does: the approver confirms the digest of the view they read. */
function sign(
  v: ApprovalView = view(),
  overrides: { value?: number; validityMinutes?: number; nonce?: string } = {},
): SignedApproval {
  return signApproval({
    view: v,
    signal: "invoiceAmount",
    value: overrides.value ?? 9000,
    confirmation: {
      digest: viewDigest(v),
      confirmedAt: NOW.toISOString(),
      approverId: APPROVER,
    },
    approverId: APPROVER,
    keyId: KEY_ID,
    privateKey: approverPair.privateKey,
    validityMinutes: overrides.validityMinutes ?? 15,
    nonce: overrides.nonce ?? `nonce-${Math.random().toString(36).slice(2)}`,
    now: NOW,
  });
}

const expected = (
  overrides: Partial<{
    value: number;
    resource: string;
    signal: string;
    capability: string;
    now: Date;
    digest: string;
  }> = {},
) => ({
  signal: overrides.signal ?? "invoiceAmount",
  capability: overrides.capability ?? "erp:pay-invoice",
  resource: overrides.resource ?? "INV-1001",
  value: overrides.value ?? 9000,
  now: overrides.now ?? NOW,
  ...(overrides.digest !== undefined && { digest: overrides.digest }),
});

describe("the view and its digest", () => {
  it("is the same for the same content, and does not depend on the transaction id", () => {
    expect(viewDigest(view())).toBe(viewDigest(view()));
    // A retry under a new transaction id shows the same content, so it has the same digest.
    const retry = view();
    expect(viewDigest(retry)).toBe(viewDigest(view()));
  });

  it("changes when any shown value changes", () => {
    expect(
      viewDigest(
        view({
          values: {
            ...view().values,
            invoiceAmount: { value: 9001, provenance: "sourced" },
          },
        }),
      ),
    ).not.toBe(viewDigest(view()));
  });
});

describe("signing an approval", () => {
  it("refuses if the request changed after the approver read it", () => {
    const shown = view();
    const changed = view({
      values: {
        ...shown.values,
        invoiceAmount: { value: 9500, provenance: "sourced" },
      },
    });
    expect(() =>
      signApproval({
        view: changed,
        signal: "invoiceAmount",
        value: 9500,
        confirmation: {
          digest: viewDigest(shown),
          confirmedAt: NOW.toISOString(),
          approverId: APPROVER,
        },
        approverId: APPROVER,
        keyId: KEY_ID,
        privateKey: approverPair.privateKey,
        validityMinutes: 15,
        nonce: "n",
        now: NOW,
      }),
    ).toThrow(/changed after it was shown/);
  });

  it("refuses a value that was not the one shown", () => {
    expect(() => sign(view(), { value: 9999 })).toThrow(
      /must be the one shown/,
    );
  });

  it("refuses a validity above the cap, or below one minute", () => {
    expect(() => sign(view(), { validityMinutes: 61 })).toThrow(
      /between 1 and 60/,
    );
    expect(() => sign(view(), { validityMinutes: 0 })).toThrow(
      /between 1 and 60/,
    );
  });

  it("refuses a confirmation made by someone other than the approver", () => {
    const v = view();
    expect(() =>
      signApproval({
        view: v,
        signal: "invoiceAmount",
        value: 9000,
        confirmation: {
          digest: viewDigest(v),
          confirmedAt: NOW.toISOString(),
          approverId: "someone-else",
        },
        approverId: APPROVER,
        keyId: KEY_ID,
        privateKey: approverPair.privateKey,
        validityMinutes: 15,
        nonce: "n",
        now: NOW,
      }),
    ).toThrow(/different approver/);
  });
});

describe("verifying an approval", () => {
  it("accepts an approval for the exact value, once", () => {
    const approvals = sign();
    const nonces = new MemoryNonceStore(() => NOW);
    expect(
      verifyApproval(approvals, expected(), {
        approvers: approversWith(),
        nonces,
      }),
    ).toEqual({ ok: true });
    expect(
      verifyApproval(approvals, expected(), {
        approvers: approversWith(),
        nonces,
      }),
    ).toMatchObject({ ok: false, code: "REPLAYED" });
  });

  it("refuses a different amount, because an approval is exact", () => {
    const result = verifyApproval(sign(), expected({ value: 9500 }), {
      approvers: approversWith(),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(result).toMatchObject({ ok: false, code: "MISMATCH" });
  });

  it("refuses an approval for a different resource", () => {
    const result = verifyApproval(sign(), expected({ resource: "INV-2002" }), {
      approvers: approversWith(),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(result).toMatchObject({ ok: false, code: "MISMATCH" });
  });

  it("refuses an approval whose digest no longer matches what is being decided", () => {
    const result = verifyApproval(
      sign(),
      expected({ digest: "0".repeat(64) }),
      { approvers: approversWith(), nonces: new MemoryNonceStore(() => NOW) },
    );
    expect(result).toMatchObject({ ok: false, code: "DIGEST_MISMATCH" });
  });

  it("refuses an expired approval", () => {
    const later = new Date(NOW.getTime() + 16 * 60_000);
    const result = verifyApproval(sign(), expected({ now: later }), {
      approvers: approversWith(),
      nonces: new MemoryNonceStore(() => later),
    });
    expect(result).toMatchObject({ ok: false, code: "EXPIRED" });
  });

  it("refuses a tampered approval", () => {
    const approval = sign();
    const tampered = {
      ...approval,
      payload: {
        ...approval.payload,
        value: 9000,
        resourceId: "INV-1001",
        expiresAt: new Date(NOW.getTime() + 59 * 60_000).toISOString(),
      },
    };
    const result = verifyApproval(tampered, expected(), {
      approvers: approversWith(),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(result).toMatchObject({ ok: false, code: "BAD_SIGNATURE" });
  });

  it("refuses an approval signed with another approver's key", () => {
    const v = view();
    const forged = signApproval({
      view: v,
      signal: "invoiceAmount",
      value: 9000,
      confirmation: {
        digest: viewDigest(v),
        confirmedAt: NOW.toISOString(),
        approverId: APPROVER,
      },
      approverId: APPROVER,
      keyId: KEY_ID,
      privateKey: otherPair.privateKey,
      validityMinutes: 15,
      nonce: "n",
      now: NOW,
    });
    const result = verifyApproval(forged, expected(), {
      approvers: approversWith(),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(result).toMatchObject({ ok: false, code: "BAD_SIGNATURE" });
  });

  it("refuses an approver who is not registered", () => {
    const result = verifyApproval(sign(), expected(), {
      approvers: new ApproverKeys(),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(result).toMatchObject({ ok: false, code: "UNKNOWN_APPROVER" });
  });

  it("refuses an approval once its approver is revoked", () => {
    const result = verifyApproval(sign(), expected(), {
      approvers: approversWith({ revoked: true }),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(result).toMatchObject({ ok: false, code: "REVOKED" });
  });

  it("does not use up the approval when it is refused for another reason", () => {
    const nonces = new MemoryNonceStore(() => NOW);
    const approval = sign(view(), { nonce: "shared" });
    expect(
      verifyApproval(approval, expected({ value: 9500 }), {
        approvers: approversWith(),
        nonces,
      }),
    ).toMatchObject({ code: "MISMATCH" });
    expect(
      verifyApproval(approval, expected(), {
        approvers: approversWith(),
        nonces,
      }),
    ).toEqual({ ok: true });
  });

  it("is refused if the approval is dated in the future beyond the clock skew", () => {
    const earlier = new Date(NOW.getTime() - 120_000);
    const result = verifyApproval(sign(), expected({ now: earlier }), {
      approvers: approversWith(),
      nonces: new MemoryNonceStore(() => earlier),
    });
    expect(result).toMatchObject({ ok: false, code: "NOT_YET_VALID" });
  });
});

describe("the checker the decision flow uses", () => {
  it("returns true for a valid approval and false for a revoked one", async () => {
    const approval = sign();
    const ok = approvalChecker({
      approvers: approversWith(),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(
      await ok("invoiceAmount", approval, {
        resource: "INV-1001",
        value: 9000,
        action: "erp:pay-invoice",
        now: NOW,
      }),
    ).toBe(true);

    const revoked = approvalChecker({
      approvers: approversWith({ revoked: true }),
      nonces: new MemoryNonceStore(() => NOW),
    });
    expect(
      await revoked("invoiceAmount", sign(), {
        resource: "INV-1001",
        value: 9000,
        action: "erp:pay-invoice",
        now: NOW,
      }),
    ).toBe(false);
  });
});

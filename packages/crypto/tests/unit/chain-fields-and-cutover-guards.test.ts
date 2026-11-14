import { describe, expect, it } from "vitest";

import {
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  type Execution,
} from "@parmana/shared";

import { AuditEventCrypto } from "../../src/AuditEventCrypto.js";
import {
  CallerAuditChainVerifier,
  type ChainedCallerAuditEventRow,
} from "../../src/CallerAuditChainVerifier.js";
import { CryptoBuilder } from "../../src/CryptoBuilder.js";
import { CryptoBootstrap } from "../../src/CryptoBootstrap.js";
import { CryptoError } from "../../src/errors/CryptoError.js";
import { ExecutableContentHasher } from "../../src/ExecutableContentHasher.js";
import { ExecutionChainCrypto } from "../../src/ExecutionChainCrypto.js";
import { isAtOrAfterCutover } from "../../src/ExecutionTrustRecordCanonicalView.js";
import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";
import { Ed25519SignatureProvider } from "../../src/providers/signature/Ed25519SignatureProvider.js";

function draftExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    executionId: "exec-1",
    businessTransactionId: "txn-1",
    decision: {
      decisionId: "decision-1",
      intentId: "intent-1",
      policy: {
        name: "vendor-payment",
        version: "1.0.0",
        schemaVersion: "1.0.0",
      },
      signals: { amount: 100 },
      outcome: DecisionOutcome.APPROVED,
      evaluatedAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    status: ExecutionStatus.PROCESSING,
    mode: ExecutionMode.SYNC,
    startedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ExecutionChainCrypto: fields bound into the chain hash", () => {
  it("binds the value of completedAt into the chain hash, not just its presence", async () => {
    const crypto = new ExecutionChainCrypto();

    const first = await crypto.chain(
      draftExecution({ completedAt: new Date("2026-08-01T00:01:00.000Z") }),
      null,
    );
    const second = await crypto.chain(
      draftExecution({ completedAt: new Date("2026-08-01T00:02:00.000Z") }),
      null,
    );

    expect(second.chainHash).not.toBe(first.chainHash);
  });

  it("binds the value of evidence into the chain hash", async () => {
    const crypto = new ExecutionChainCrypto();

    const first = await crypto.chain(
      draftExecution({ evidence: { receipt: "r-1" } } as Partial<Execution>),
      null,
    );
    const second = await crypto.chain(
      draftExecution({ evidence: { receipt: "r-2" } } as Partial<Execution>),
      null,
    );

    expect(second.chainHash).not.toBe(first.chainHash);
  });

  it("binds the value of metadata into the chain hash", async () => {
    const crypto = new ExecutionChainCrypto();

    const first = await crypto.chain(
      draftExecution({
        metadata: { source: "partner-a" },
      } as Partial<Execution>),
      null,
    );
    const second = await crypto.chain(
      draftExecution({
        metadata: { source: "partner-b" },
      } as Partial<Execution>),
      null,
    );

    expect(second.chainHash).not.toBe(first.chainHash);
  });

  it("refuses an Execution missing its chainHash or chainSignature", async () => {
    const crypto = new ExecutionChainCrypto();
    const chained = await crypto.chain(draftExecution(), null);
    const entry = draftExecution(chained as Partial<Execution>);

    await expect(crypto.verifyEntry(entry)).resolves.toBe(true);
    await expect(
      crypto.verifyEntry({ ...entry, chainHash: undefined }),
    ).resolves.toBe(false);
    await expect(
      crypto.verifyEntry({ ...entry, chainSignature: undefined }),
    ).resolves.toBe(false);
  });
});

describe("CallerAuditChainVerifier: partly chained rows", () => {
  const audit = new AuditEventCrypto();

  async function plainRow(): Promise<ChainedCallerAuditEventRow> {
    const event = {
      type: "caller.authenticated",
      occurredAt: "2026-01-01T00:00:00.000Z",
      route: "/execute",
      callerId: "caller-1",
    };

    return {
      event,
      signature: await audit.sign(event),
      chainHash: null,
      previousChainHash: null,
      chainPosition: null,
    };
  }

  it("treats a row with a chainHash but no chainPosition as unchained", async () => {
    const row = { ...(await plainRow()), chainHash: "f".repeat(64) };

    const result = await new CallerAuditChainVerifier().verifyChain([row]);

    expect(result).toEqual({ valid: true });
  });

  it("treats a row with a chainPosition but no chainHash as unchained", async () => {
    const row = { ...(await plainRow()), chainPosition: 1 };

    const result = await new CallerAuditChainVerifier().verifyChain([row]);

    expect(result).toEqual({ valid: true });
  });
});

describe("ExecutableContentHasher", () => {
  const hasher = new ExecutableContentHasher(CryptoBootstrap.create());
  const content = {
    businessTransactionId: "txn-1",
    action: "TransferFunds",
    target: "account/12345",
    parameters: { amount: 100 },
  };

  it("returns a non-empty string, the same for the same content", async () => {
    const first = await hasher.hash(content);

    expect(first.length).toBeGreaterThan(0);
    expect(await hasher.hash({ ...content })).toBe(first);
  });

  it("returns a different hash when the content changes", async () => {
    const first = await hasher.hash(content);

    expect(
      await hasher.hash({ ...content, action: "TransferFundsLater" }),
    ).not.toBe(first);
  });
});

describe("CryptoBuilder: refusal messages", () => {
  it("names the missing hash provider", () => {
    expect(() =>
      new CryptoBuilder().withSignature(new Ed25519SignatureProvider()).build(),
    ).toThrow(new CryptoError("HashProvider has not been configured."));
  });

  it("names the missing signature provider", () => {
    expect(() =>
      new CryptoBuilder().withHash(new SHA256HashProvider()).build(),
    ).toThrow(new CryptoError("SignatureProvider has not been configured."));
  });
});

describe("isAtOrAfterCutover", () => {
  const cutover = "2026-09-01T00:00:00.000Z";

  it("is false when no cutover is configured", () => {
    expect(isAtOrAfterCutover("2026-12-01T00:00:00.000Z", undefined)).toBe(
      false,
    );
  });

  it("is true at the exact cutover instant", () => {
    expect(isAtOrAfterCutover(cutover, cutover)).toBe(true);
  });

  it("is true after the cutover and false before it", () => {
    expect(isAtOrAfterCutover("2026-09-02T00:00:00.000Z", cutover)).toBe(true);
    expect(isAtOrAfterCutover("2026-08-31T23:59:59.999Z", cutover)).toBe(false);
  });

  it("is false for a createdAt that does not parse", () => {
    expect(isAtOrAfterCutover("not-a-date", cutover)).toBe(false);
  });
});

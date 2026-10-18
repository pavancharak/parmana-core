import { generateKeyPairSync } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  type Execution,
  type ExecutionTrustRecord,
  type RefusalRecord,
} from "@parmana/shared";

import {
  AuditEventCrypto,
  AuthorizationSigner,
  CallerAuditChainVerifier,
  CryptoBootstrap,
  ExecutionChainCrypto,
  FileKeyExpiryStore,
  FileKeyProvider,
  KeyPair,
  ReceiptCrypto,
  RefusalCrypto,
  TrustRecordHasher,
  VerificationCrypto,
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
  type ChainedCallerAuditEventRow,
} from "../../src/index.js";

/**
 * Mutation testing found these verification and key checks tested only
 * as a whole, or not in this package: a hash check that a matching
 * signature made redundant in every test, the half-chained Execution
 * that was skipped as legacy data, refusal and receipt crypto (0%),
 * key expiry parsing, keyId validation on its own, and the hybrid
 * verification that requires both signatures. Each is pinned here.
 */

const keyDirectory = process.env.PARMANA_KEY_DIR!;

describe("ExecutionChainCrypto, exactly", () => {
  const chain = new ExecutionChainCrypto();

  const draft = (executionId: string): Execution => ({
    executionId,
    businessTransactionId: "txn-1",
    decision: {
      decisionId: "decision-1",
      intentId: "intent-1",
      policy: { name: "p", version: "1.0.0", schemaVersion: "1.0.0" },
      signals: { amount: 100 },
      outcome: DecisionOutcome.APPROVED,
      evaluatedAt: new Date("2026-08-01T00:00:00.000Z"),
    },
    status: ExecutionStatus.PROCESSING,
    mode: ExecutionMode.SYNC,
    startedAt: new Date("2026-08-01T00:00:00.000Z"),
  });

  async function chained(): Promise<[Execution, Execution]> {
    const first = { ...draft("e1"), ...(await chain.chain(draft("e1"), null)) };
    const second = {
      ...draft("e2"),
      ...(await chain.chain(draft("e2"), first.chainHash!)),
    };
    return [first, second];
  }

  it("refuses an entry whose chainHash alone was changed", async () => {
    const [first] = await chained();
    await expect(
      chain.verifyEntry({ ...first, chainHash: "0".repeat(64) }),
    ).resolves.toBe(false);
  });

  it("refuses an entry missing either chain field", async () => {
    const [first] = await chained();
    const { chainHash: _h, ...noHash } = first;
    const { chainSignature: _s, ...noSignature } = first;
    await expect(chain.verifyEntry(noHash as Execution)).resolves.toBe(false);
    await expect(chain.verifyEntry(noSignature as Execution)).resolves.toBe(
      false,
    );
  });

  it("names the entry whose content no longer matches", async () => {
    const [first, second] = await chained();
    expect(
      await chain.verifyChain([
        first,
        { ...second, status: ExecutionStatus.COMPLETED },
      ]),
    ).toEqual({
      valid: false,
      brokenAt: "e2",
      reason: "chainHash or chainSignature does not match recomputed content.",
    });
  });

  it("refuses an edited entry whose chainSignature was removed, instead of skipping it as legacy", async () => {
    const [first, second] = await chained();
    const { chainSignature: _s, ...stripped } = {
      ...second,
      status: ExecutionStatus.COMPLETED,
    };
    expect(
      await chain.verifyChain([first, stripped as Execution]),
    ).toMatchObject({ valid: false, brokenAt: "e2" });
  });

  it("refuses an entry with only previousChainHash left", async () => {
    const [first, second] = await chained();
    const { chainSignature: _s, chainHash: _h, ...stripped } = second;
    expect(
      await chain.verifyChain([first, stripped as Execution]),
    ).toMatchObject({ valid: false, brokenAt: "e2" });
  });

  it.each(["chainHash", "chainSignature"] as const)(
    "refuses a first entry carrying only its %s, naming why",
    async (kept) => {
      const [first] = await chained();
      const partial = {
        ...draft("e1"),
        [kept]: first[kept],
      } as Execution;
      expect(await chain.verifyChain([partial])).toEqual({
        valid: false,
        brokenAt: "e1",
        reason:
          "Execution carries only some chain fields; chainHash and chainSignature are always written together.",
      });
    },
  );

  it("refuses a first entry carrying only a previousChainHash", async () => {
    expect(
      await chain.verifyChain([
        { ...draft("e1"), previousChainHash: "0".repeat(64) },
      ]),
    ).toMatchObject({ valid: false, brokenAt: "e1" });
  });

  it("refuses an unchained entry after a chained one, even as the last", async () => {
    const [first] = await chained();
    expect(await chain.verifyChain([first, draft("e2")])).toEqual({
      valid: false,
      brokenAt: "e2",
      reason: "Execution has no chain fields but follows a chained execution.",
    });
  });

  it("still accepts legacy entries before the chain starts", async () => {
    const first = { ...draft("e1"), ...(await chain.chain(draft("e1"), null)) };
    expect(await chain.verifyChain([draft("e0"), first])).toEqual({
      valid: true,
    });
  });
});

describe("CallerAuditChainVerifier, exactly", () => {
  const audit = new AuditEventCrypto();
  const hasher = new TrustRecordHasher(CryptoBootstrap.create());

  async function row(
    previousChainHash: string | null,
    chainPosition: number,
  ): Promise<ChainedCallerAuditEventRow> {
    const event = { type: "caller.authenticated", position: chainPosition };
    const content = { ...event, previousChainHash, chainPosition };
    return {
      event,
      signature: await audit.sign(content),
      chainHash: await hasher.hash(content),
      previousChainHash,
      chainPosition,
    };
  }

  it("refuses a row whose chainHash alone was changed, at its position", async () => {
    const first = await row(null, 1);
    expect(
      await new CallerAuditChainVerifier().verifyChain([
        { ...first, chainHash: "0".repeat(64) },
      ]),
    ).toEqual({
      valid: false,
      brokenAtPosition: 1,
      reason: "chainHash does not match recomputed content.",
    });
  });

  it("refuses a row stripped of its chain position, as its signature no longer verifies", async () => {
    const first = await row(null, 1);
    expect(
      await new CallerAuditChainVerifier().verifyChain([
        { ...first, chainPosition: null },
      ]),
    ).toMatchObject({ valid: false, brokenAtPosition: 1 });
  });
});

describe("RefusalCrypto, exactly", () => {
  const refusal = new RefusalCrypto();

  async function signedRefusal(): Promise<RefusalRecord> {
    const draft = {
      refusalRecordId: "refusal-1",
      businessTransactionId: "txn-1",
      decision: { decisionId: "d-1", outcome: "REJECTED", reason: "no" },
      evaluatedIntent: { action: "pay", target: "vendor/1" },
      submittedBy: "caller-1",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as unknown as RefusalRecord;
    const refusalRecordHash = await refusal.hash(draft);
    const signature = await refusal.sign(draft);
    return { ...draft, refusalRecordHash, signature } as RefusalRecord;
  }

  it("verifies a genuine refusal", async () => {
    await expect(refusal.verify(await signedRefusal())).resolves.toBe(true);
  });

  it("refuses a refusal whose stored hash alone was changed", async () => {
    await expect(
      refusal.verify({ ...(await signedRefusal()), refusalRecordHash: "x" }),
    ).resolves.toBe(false);
  });

  it.each([
    ["refusalRecordId", "refusal-2"],
    ["businessTransactionId", "txn-2"],
    ["submittedBy", "caller-2"],
    ["evaluatedIntent", { action: "pay", target: "vendor/2" }],
    ["decision", { decisionId: "d-1", outcome: "APPROVED" }],
    ["bindingViolations", [{ signalKey: "amount" }]],
    ["createdAt", new Date("2026-01-02T00:00:00Z")],
  ])("refuses a refusal whose %s was changed", async (field, value) => {
    await expect(
      refusal.verify({ ...(await signedRefusal()), [field]: value }),
    ).resolves.toBe(false);
  });

  it("hashes a refusal without policyContentHash exactly as before the field existed, so older records still verify", async () => {
    const { refusalRecordHash } = await signedRefusal();
    // Computed with RefusalCrypto before policyContentHash was added.
    expect(refusalRecordHash).toBe(
      "1abb934fb29c8390620b5df129d48b489486b021e8369b06ee7c1535e385b7ac",
    );
  });

  it("signs policyContentHash: changing, removing or adding it breaks verification", async () => {
    const policyContentHash = "a".repeat(64);
    const draft = {
      ...(await signedRefusal()),
      policyContentHash,
    } as RefusalRecord;
    const withHash = {
      ...draft,
      refusalRecordHash: await refusal.hash(draft),
      signature: await refusal.sign(draft),
    } as RefusalRecord;

    await expect(refusal.verify(withHash)).resolves.toBe(true);
    await expect(
      refusal.verify({ ...withHash, policyContentHash: "b".repeat(64) }),
    ).resolves.toBe(false);

    const { policyContentHash: _removed, ...withoutHash } = withHash;
    await expect(refusal.verify(withoutHash as RefusalRecord)).resolves.toBe(
      false,
    );

    await expect(
      refusal.verify({ ...(await signedRefusal()), policyContentHash }),
    ).resolves.toBe(false);
  });

  it("refuses a signature from another refusal", async () => {
    const genuine = await signedRefusal();
    const other = await refusal.sign({
      ...genuine,
      refusalRecordId: "refusal-2",
    });
    await expect(
      refusal.verify({ ...genuine, signature: other }),
    ).resolves.toBe(false);
  });
});

describe("ReceiptCrypto in single signature mode", () => {
  it("signs the receipt with its algorithm, with no hybrid fields", async () => {
    const receipt = await new ReceiptCrypto().createReceipt({
      receiptId: "r-1",
      businessTransactionId: "txn-1",
    } as never);
    expect(receipt).toMatchObject({
      receiptId: "r-1",
      businessTransactionId: "txn-1",
      algorithm: "ed25519",
    });
    expect(typeof receipt.signature).toBe("string");
    expect(receipt.signature.length).toBeGreaterThan(0);
    expect(receipt).not.toHaveProperty("signatures");
    expect(receipt).not.toHaveProperty("schemaVersion");
  });
});

describe("FileKeyExpiryStore, exactly", () => {
  const path = join(keyDirectory, "key-expiry.json");
  afterEach(() => rmSync(path, { force: true }));

  it.each([["null"], ['"text"'], ["5"]])(
    "refuses a file holding %s",
    async (body) => {
      writeFileSync(path, body);
      await expect(new FileKeyExpiryStore().get("k")).rejects.toThrow(
        `${path} must be a JSON object keyed by keyId.`,
      );
    },
  );

  it.each([[5], [null], ["not a date"]])(
    "refuses expiresAt %j",
    async (expiresAt) => {
      writeFileSync(path, JSON.stringify({ k: { expiresAt } }));
      await expect(new FileKeyExpiryStore().get("k")).rejects.toThrow(
        `${path}["k"].expiresAt must be an ISO 8601 date string.`,
      );
    },
  );

  it.each([["true"], [1], [null]])("refuses revoked %j", async (revoked) => {
    writeFileSync(path, JSON.stringify({ k: { revoked } }));
    await expect(new FileKeyExpiryStore().get("k")).rejects.toThrow(
      `${path}["k"].revoked must be a boolean.`,
    );
  });

  it("returns only the fields present", async () => {
    writeFileSync(
      path,
      JSON.stringify({
        a: {},
        b: { revoked: false },
        c: { expiresAt: "2030-01-01T00:00:00Z" },
      }),
    );
    const store = new FileKeyExpiryStore();
    expect(await store.get("a")).toStrictEqual({});
    expect(await store.get("b")).toStrictEqual({ revoked: false });
    expect(await store.get("c")).toStrictEqual({
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });
  });
});

describe("FileKeyProvider keyId check on its own", () => {
  it.each(["sub/default", "default/x", "x\\default", "default\0", ""])(
    "refuses %j as a keyId even when it would stay inside the directory",
    async (keyId) => {
      await expect(new FileKeyProvider().getPublicKey(keyId)).rejects.toThrow(
        /^Invalid keyId: .* Must match/,
      );
    },
  );

  it("reports a key that does not exist, for each half", async () => {
    const provider = new FileKeyProvider();
    await expect(provider.getPublicKey("absent")).rejects.toThrow(
      "Public key not found: absent",
    );
    await expect(provider.getPrivateKey("absent")).rejects.toThrow(
      "Private key not found: absent",
    );
    await expect(provider.getMetadata("absent")).rejects.toThrow(
      "Key not found: absent",
    );
  });
});

describe("AuthorizationSigner payload", () => {
  const signer = new AuthorizationSigner(CryptoBootstrap.create());
  const { privateKey } = generateKeyPairSync("ed25519");
  const base = {
    decisionId: "d-1",
    businessTransactionId: "txn-1",
    policyName: "p",
    policyVersion: "1.0.0",
    executableContent: {
      businessTransactionId: "txn-1",
      action: "pay",
      target: "vendor/1",
      parameters: {},
    },
  };

  it("signs each optional field only when given", async () => {
    const without = await signer.sign(base, privateKey, "k", 60);
    for (const field of [
      "policyContentHash",
      "signalsHash",
      "submittedBy",
      "grantedCapability",
    ]) {
      expect(without.payload).not.toHaveProperty(field);
    }

    const withAll = await signer.sign(
      {
        ...base,
        policyContentHash: "pch",
        signalsHash: "sh",
        submittedBy: "caller-1",
        grantedCapability: "pay",
      },
      privateKey,
      "k",
      60,
    );
    expect(withAll.payload).toMatchObject({
      policyContentHash: "pch",
      signalsHash: "sh",
      submittedBy: "caller-1",
      grantedCapability: "pay",
    });
    expect(withAll).toMatchObject({ keyId: "k", algorithm: "ed25519" });
  });
});

describe("VerificationCrypto outside hybrid mode", () => {
  it("refuses to make hybrid signatures", async () => {
    await expect(
      new VerificationCrypto().signHybrid({} as ExecutionTrustRecord),
    ).rejects.toThrow(
      "VerificationCrypto.signHybrid() requires CRYPTO_MODE=hybrid.",
    );
  });
});

describe("AuthorizationSigner.signWithSigner", () => {
  it("signs the same payload shape through a Signer, with its key id", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const provider = CryptoBootstrap.create().signature;
    const signed = await new AuthorizationSigner(
      CryptoBootstrap.create(),
    ).signWithSigner(
      {
        decisionId: "d-1",
        businessTransactionId: "txn-1",
        policyName: "p",
        policyVersion: "1.0.0",
        signalsHash: "sh",
        executableContent: {
          businessTransactionId: "txn-1",
          action: "pay",
          target: "vendor/1",
          parameters: {},
        },
      },
      "kms-key",
      {
        sign: (_keyId: string, data: Uint8Array) =>
          provider.sign(data, privateKey),
        getPublicKey: async () => publicKey,
        getMetadata: async (keyId: string) => ({
          keyId,
          algorithm: "ed25519" as never,
        }),
        hasKey: async () => true,
      },
      60,
    );
    expect(signed).toMatchObject({
      keyId: "kms-key",
      algorithm: "ed25519",
      payload: { decisionId: "d-1", signalsHash: "sh" },
    });
    expect(signed.signature.length).toBeGreaterThan(0);
  });
});

describe("KeyPair", () => {
  it("refuses empty halves, copies the keys and redacts the private one", () => {
    expect(() => new KeyPair(new Uint8Array(), new Uint8Array([1]))).toThrow(
      "Public key cannot be empty.",
    );
    expect(() => new KeyPair(new Uint8Array([1]), new Uint8Array())).toThrow(
      "Private key cannot be empty.",
    );
    const source = new Uint8Array([1, 2]);
    const pair = new KeyPair(source, new Uint8Array([3]));
    source[0] = 9;
    expect(Array.from(pair.publicKey)).toEqual([1, 2]);
    expect(Object.isFrozen(pair)).toBe(true);
    expect(pair.toJSON()).toEqual({
      publicKey: Buffer.from([1, 2]).toString("base64"),
      privateKey: "***REDACTED***",
    });
  });
});

describe.skipIf(!isMlDsa65Supported())(
  `VerificationCrypto in hybrid mode${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    const saved = { ...process.env };

    beforeAll(() => {
      process.env.CRYPTO_MODE = "hybrid";
      process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";
      const privatePath = join(keyDirectory, "default-secondary.private.pem");
      if (!existsSync(privatePath)) {
        const keys = generateKeyPairSync("ml-dsa-65");
        writeFileSync(
          privatePath,
          keys.privateKey.export({ format: "pem", type: "pkcs8" }),
        );
        writeFileSync(
          join(keyDirectory, "default-secondary.public.pem"),
          keys.publicKey.export({ format: "pem", type: "spki" }),
        );
      }
    });

    afterAll(() => {
      process.env = saved;
    });

    async function hybridRecord(crypto: VerificationCrypto) {
      const draft = {
        trustRecordId: "t-1",
        businessTransactionId: "t-1",
        transaction: { businessTransactionId: "t-1" },
        overrides: [],
        executions: [],
        verifications: [],
        receipts: [],
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      } as unknown as ExecutionTrustRecord;
      const trustRecordHash = await crypto.hash(draft);
      const withHash = { ...draft, trustRecordHash } as ExecutionTrustRecord;
      const signature = await crypto.sign(withHash);
      const signatures = await crypto.signHybrid({ ...withHash, signature });
      return { ...withHash, signature, schemaVersion: 2, signatures };
    }

    it("verifies a genuine hybrid record", async () => {
      const crypto = new VerificationCrypto();
      await expect(crypto.verify(await hybridRecord(crypto))).resolves.toBe(
        true,
      );
    });

    it("refuses a record whose hybrid signatures fail, though its legacy signature verifies", async () => {
      const crypto = new VerificationCrypto();
      const record = await hybridRecord(crypto);
      const [a, b] = record.signatures;
      const swapped = [
        { ...a!, signature: b!.signature },
        { ...b!, signature: a!.signature },
      ];
      await expect(
        crypto.verifySignature({ ...record, signatures: swapped }),
      ).resolves.toBe(false);
    });

    it("refuses a record whose stored hash was changed", async () => {
      const crypto = new VerificationCrypto();
      await expect(
        crypto.verify({
          ...(await hybridRecord(crypto)),
          trustRecordHash: "x",
        }),
      ).resolves.toBe(false);
    });

    it("treats an empty signatures array as legacy when hybrid is not required", async () => {
      const crypto = new VerificationCrypto();
      const record = await hybridRecord(crypto);
      await expect(crypto.verify({ ...record, signatures: [] })).resolves.toBe(
        true,
      );
    });

    it("verifies a hybrid record without schemaVersion against version 2", async () => {
      const crypto = new VerificationCrypto();
      const { schemaVersion: _v, ...record } = await hybridRecord(crypto);
      await expect(crypto.verify(record as ExecutionTrustRecord)).resolves.toBe(
        true,
      );
    });

    it("refuses three hybrid entries, though two of them verify", async () => {
      const crypto = new VerificationCrypto();
      const record = await hybridRecord(crypto);
      await expect(
        crypto.verifySignature({
          ...record,
          signatures: [...record.signatures, record.signatures[0]!],
        }),
      ).resolves.toBe(false);
    });

    it("refuses two entries of the same algorithm", async () => {
      const crypto = new VerificationCrypto();
      const record = await hybridRecord(crypto);
      await expect(
        crypto.verifySignature({
          ...record,
          signatures: [record.signatures[0]!, record.signatures[0]!],
        }),
      ).resolves.toBe(false);
    });

    it("signs a receipt with both algorithms in hybrid mode", async () => {
      const receipt = await new ReceiptCrypto().createReceipt({
        receiptId: "r-1",
        businessTransactionId: "txn-1",
      } as never);
      expect(receipt).toMatchObject({
        receiptId: "r-1",
        algorithm: "ed25519",
        schemaVersion: 2,
      });
      expect(typeof receipt.signature).toBe("string");
      expect(
        receipt.signatures?.map((entry) => entry.algorithm).sort(),
      ).toEqual(["dilithium3", "ed25519"]);
    });

    it("lists only public key files, and names the ML-DSA key's algorithm", async () => {
      const provider = new FileKeyProvider();
      const keys = await provider.listKeys!();
      expect(keys).toContain("default-secondary");
      for (const key of keys) {
        expect(existsSync(join(keyDirectory, `${key}.public.pem`))).toBe(true);
      }
      expect(new Set(keys).size).toBe(keys.length);
      expect(await provider.getMetadata("default-secondary")).toEqual({
        keyId: "default-secondary",
        algorithm: "dilithium3",
      });
      expect(await provider.getMetadata("default")).toEqual({
        keyId: "default",
        algorithm: "ed25519",
      });
    });

    it("with HYBRID_SIGNATURE_REQUIRED, refuses a record stripped of its hybrid signatures", async () => {
      const signing = new VerificationCrypto();
      const record = await hybridRecord(signing);
      const { signatures: _s, schemaVersion: _v, ...stripped } = record;

      await expect(
        signing.verify(stripped as ExecutionTrustRecord),
      ).resolves.toBe(true);

      process.env.HYBRID_SIGNATURE_REQUIRED = "true";
      try {
        await expect(
          new VerificationCrypto().verify(stripped as ExecutionTrustRecord),
        ).resolves.toBe(false);
        await expect(
          new VerificationCrypto().verify({ ...record, signatures: [] }),
        ).resolves.toBe(false);
      } finally {
        delete process.env.HYBRID_SIGNATURE_REQUIRED;
      }
    });
  },
);

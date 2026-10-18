import crypto, { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CryptoBootstrap, RefusalCrypto, type Signer } from "@parmana/crypto";
import type { ReleaseTransport } from "@parmana/execution-gateway";
import {
  PolicyAction,
  type Policy,
  type PolicyRepository,
} from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import {
  AuthorityStatus,
  AuthorityType,
  BusinessTransactionStatus,
  BusinessValidationStatus,
  PendingPolicyChangeStatus,
  type BusinessTransaction,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
  type RefusalRecord,
  type RefusalRecordRepository,
  type ResolvedAddress,
} from "@parmana/shared";
import { MemoryBusinessSignalSourceRepository } from "@parmana/storage";

import { RepositoryBusinessSignalSourceRegistry } from "../../src/business-sources/HttpBusinessSignalSource.js";

import { createSignalSourceHandler } from "../../../../typescript/examples/08-business-signal-source.js";
import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * RFC-0023 phase 2, end to end below HTTP: a business system registered
 * through maker checker (the repository), asked over the HTTP source's
 * signed protocol, answered by the endpoint the docs tell an operator to
 * run (typescript/examples/08), decides a request in the real
 * RuntimeEngine. The ERP, not the agent, says whether the invoice is
 * paid, and the signed records carry the verified Trusted Signal. No
 * network: DNS and the transport are stubs.
 */

const ENDPOINT = "https://erp.example.com/parmana/signals";

const parmanaKeys = generateKeyPairSync("ed25519");
const signatureProvider = CryptoBootstrap.create().signature;
const parmanaSigner: Signer = {
  sign: (_keyId, data) => signatureProvider.sign(data, parmanaKeys.privateKey),
  getPublicKey: async () => parmanaKeys.publicKey,
  getMetadata: async (keyId) => ({ keyId, algorithm: "ed25519" as never }),
  hasKey: async () => true,
};

const erpKeys = generateKeyPairSync("ed25519");

const publicLookup = async (): Promise<readonly ResolvedAddress[]> => [
  { address: "203.0.114.10", family: 4 },
];

const POLICY: Policy = {
  policyId: "release-goods",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  signalsSchema: { invoicePaid: "boolean", warehouseApproved: "boolean" },
  approvalSignals: {
    warehouseApproved: { resourceId: "parameters.invoiceId" },
  },
  signalSources: {
    invoicePaid: {
      source: "erp",
      claim: "invoice.paid",
      subject: "parameters.invoiceId",
      maxAgeSeconds: 60,
    },
  },
  rules: [
    {
      id: "reject-unpaid",
      condition: { fact: "invoicePaid", operator: "eq", value: false },
      outcome: {
        action: PolicyAction.REJECT,
        reason: "The invoice is not paid.",
      },
    },
    {
      id: "approve-release",
      condition: {
        all: [
          { fact: "warehouseApproved", operator: "is_true" },
          { fact: "invoicePaid", operator: "is_true" },
        ],
      },
      outcome: { action: PolicyAction.APPROVE, reason: "Paid and approved." },
    },
  ],
};

class TrustRecords implements ExecutionTrustRecordRepository {
  public created: ExecutionTrustRecord[] = [];
  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    this.created.push(record);
    return record;
  }
  async findByTransactionId(): Promise<null> {
    return null;
  }
  async appendExecution(): Promise<void> {}
  async replaceExecution(): Promise<void> {}
  async appendOverride(): Promise<void> {}
  async appendVerification(): Promise<void> {}
  async appendReceipt(): Promise<void> {}
}

class RefusalRecords implements RefusalRecordRepository {
  public created: RefusalRecord[] = [];
  async create(record: RefusalRecord): Promise<RefusalRecord> {
    this.created.push(record);
    return record;
  }
  async findByTransactionId(): Promise<null> {
    return null;
  }
}

function policyRepository(): PolicyRepository {
  return {
    async load() {
      return POLICY;
    },
    async save() {
      throw new Error("not used");
    },
  };
}

function releaseGoods(
  invoiceId: string,
  signals: Record<string, unknown> = {},
): BusinessTransaction {
  const at = new Date();
  return {
    businessTransactionId: `txn-${crypto.randomUUID()}`,
    metadata: { businessTransactionId: "txn", submittedBy: "agent-x" },
    authority: {
      authorityId: "a-1",
      authorityType: AuthorityType.SERVICE,
      principalId: "agent-x",
      issuedAt: at,
    },
    authorization: {
      authorizationId: "z-1",
      authorityId: "a-1",
      purpose: "test",
      issuedAt: at,
    },
    intent: {
      intentId: "i-1",
      authorizationId: "z-1",
      action: "release-goods",
      target: `invoices/${invoiceId}`,
      parameters: { invoiceId },
      createdAt: at,
    },
    policy: { name: "release-goods", version: "1.0.0", schemaVersion: "1.0.0" },
    signals: signals as never,
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: at,
  };
}

let keyDir: string;
let previousKeyDir: string | undefined;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), "parmana-business-source-keys-"));
  writeFileSync(
    join(keyDir, "default.private.pem"),
    parmanaKeys.privateKey.export({ format: "pem", type: "pkcs8" }),
  );
  writeFileSync(
    join(keyDir, "default.public.pem"),
    parmanaKeys.publicKey.export({ format: "pem", type: "spki" }),
  );
  previousKeyDir = process.env.PARMANA_KEY_DIR;
  process.env.PARMANA_KEY_DIR = keyDir;
});

afterEach(() => {
  if (previousKeyDir === undefined) delete process.env.PARMANA_KEY_DIR;
  else process.env.PARMANA_KEY_DIR = previousKeyDir;
  rmSync(keyDir, { recursive: true, force: true });
});

async function setUp(paid: ReadonlyMap<string, boolean>) {
  const repository = new MemoryBusinessSignalSourceRepository();
  const changeId = crypto.randomUUID();

  // What an approved register change through the API stores.
  await repository.createChange({
    changeId,
    action: "register",
    name: "erp",
    endpointUrl: ENDPOINT,
    timeoutMs: 5_000,
    publicKeyPem: erpKeys.publicKey
      .export({ format: "pem", type: "spki" })
      .toString(),
    keyId: "erp-2026-10",
    reason: "Release goods only against paid invoices.",
    proposedBy: "maker",
    proposedAt: new Date(),
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
  });
  await repository.approveChange(changeId, "checker", new Date());

  const erp = createSignalSourceHandler({
    parmanaPublicKeyPem: parmanaKeys.publicKey
      .export({ format: "pem", type: "spki" })
      .toString(),
    audience: ENDPOINT,
    privateKeyPem: erpKeys.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
    keyId: "erp-2026-10",
    lookup: async (claim, subject) => {
      const value = paid.get(subject);
      return claim !== "invoice.paid" || value === undefined
        ? { status: "not_found", reason: `no invoice ${subject}` }
        : { status: "observed", value, observedAt: new Date() };
    },
  });

  const queries: string[] = [];
  const transport: ReleaseTransport = async ({ url, body }) => {
    queries.push(url.href);
    const answer = await erp(JSON.parse(body));
    return { status: answer.status, body: JSON.stringify(answer.body) };
  };

  const trust = new TrustRecords();
  const refusals = new RefusalRecords();
  const engine = new RuntimeBuilder()
    .withPolicyRepository(policyRepository())
    .withSignalStateVerifier(testApprovalSignalVerifier())
    .withBusinessSignalSources(
      new RepositoryBusinessSignalSourceRegistry(repository, {
        signer: parmanaSigner,
        lookup: publicLookup,
        transport,
      }),
    )
    .build(trust, refusals);

  return { engine, trust, refusals, queries, repository };
}

describe("A registered business system decides through the runtime (RFC-0023 phase 2)", () => {
  it("executes on the ERP's signed answer, with the verified Trusted Signal in the Trust Record", async () => {
    const { engine, trust, queries } = await setUp(
      new Map([["INV-1001", true]]),
    );
    const transaction = await withTestApproval(
      releaseGoods("INV-1001"),
      POLICY,
    );

    const result = await engine.execute(transaction);

    expect(queries).toEqual([ENDPOINT]);
    expect(result.context.decision.assessment).toMatchObject({
      authority: { status: AuthorityStatus.AUTHORIZED },
      businessValidation: { status: BusinessValidationStatus.VALID },
    });
    expect(
      trust.created[0]?.executions[0]?.decision.assessment?.businessValidation
        .signals?.[0],
    ).toMatchObject({
      source: "erp",
      sourceIdentity: ENDPOINT,
      claim: "invoice.paid",
      subject: "INV-1001",
      observedValue: true,
      integrityProof: {
        sourceKeyId: "erp-2026-10",
        sourceProofVerified: true,
      },
    });
  });

  it("refuses when the agent claims an unpaid invoice is paid, in a Refusal Record that verifies", async () => {
    const { engine, refusals } = await setUp(new Map([["INV-1002", false]]));
    const transaction = await withTestApproval(
      releaseGoods("INV-1002", { invoicePaid: true }),
      POLICY,
    );

    await expect(engine.execute(transaction)).rejects.toThrow();

    const record = JSON.parse(JSON.stringify(refusals.created[0]));
    expect(record.decision.matchedRuleId).toBe("business-validation-invalid");
    expect(record.decision.signals.invoicePaid).toBe(true);
    expect(
      record.decision.assessment.businessValidation.signals[0],
    ).toMatchObject({
      observedValue: false,
      integrityProof: { sourceProofVerified: true },
    });
    expect(await new RefusalCrypto().verify(record)).toBe(true);
  });

  it("refuses as SOURCE_UNAVAILABLE once the source is revoked, and asks nobody", async () => {
    const { engine, refusals, queries, repository } = await setUp(
      new Map([["INV-1001", true]]),
    );
    const revokeId = crypto.randomUUID();
    await repository.createChange({
      changeId: revokeId,
      action: "revoke",
      name: "erp",
      reason: "The ERP moves.",
      proposedBy: "maker",
      proposedAt: new Date(),
      status: PendingPolicyChangeStatus.PENDING_APPROVAL,
    });
    await repository.approveChange(revokeId, "checker", new Date());

    const transaction = await withTestApproval(
      releaseGoods("INV-1001"),
      POLICY,
    );

    await expect(engine.execute(transaction)).rejects.toThrow();
    expect(queries).toEqual([]);
    expect(refusals.created[0]?.decision.matchedRuleId).toBe(
      "business-validation-source-unavailable",
    );
  });
});

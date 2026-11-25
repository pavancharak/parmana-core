import { generateKeyPairSync, type KeyObject } from "node:crypto";

import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";
import type {
  ApprovalIssuerRecord,
  ApprovalIssuerRepository,
} from "@parmana/shared";
import { MemoryApprovalNonceLedger } from "@parmana/storage";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { GovernedApprovalIssuerRegistry } from "../../src/bootstrap/createApprovalIssuerRegistry.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { seedPolicyGovernanceApprovals } from "../../../../test-support/policy-governance.js";
import {
  withTestApproval,
  type TestApprovalSigner,
} from "../../../../test-support/approvals.js";
import { createTrustedFacts } from "../helpers/trusted-facts.js";
const trustedFacts = createTrustedFacts();

/**
 * The approver table cannot be read. The approval comes from an approver that
 * is in the table only (not in code), so the lookup must go to the table. The
 * control run answers that lookup; the forced run makes it fail. Everything
 * else is the same, so the difference is the lookup.
 *
 * Expected: the failed lookup makes the approver unknown, the approval is
 * refused, and the caller gets 403 POLICY_DENIED. The cause is logged as
 * approval_issuer_lookup_failed and is not in the response.
 */

const TABLE_APPROVER = "table-only-approver";
const TABLE_KEY = "table-only-key-1";

beforeAll(async () => {
  await seedPolicyGovernanceApprovals();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function tableSigner(): { signer: TestApprovalSigner; publicKeyPem: string } {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  return {
    signer: {
      approverId: TABLE_APPROVER,
      keyId: TABLE_KEY,
      privateKey: pair.privateKey as KeyObject,
    },
    publicKeyPem,
  };
}

function appWith(repository: ApprovalIssuerRepository) {
  const registry = new GovernedApprovalIssuerRegistry(
    new StaticApprovalIssuerRegistry([]),
    repository,
  );
  const approvalVerifier = new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: registry,
    nonceStore: new MemoryApprovalNonceLedger(),
  });
  const { executionSystem, auditSink } = createInspectableExecutionSystem();
  const app = createApp(
    createApplication(
      executionSystem,
      approvalVerifier,
      undefined,
      undefined,
      trustedFacts.registry,
    ),
    {
      callerAuth: "disabled",
    },
  );
  return { app, auditSink };
}

/** A table that answers the lookup for the table-only approver. */
function workingTable(
  publicKeyPem: string,
  action: string,
): ApprovalIssuerRepository {
  return {
    findIssuer: async (approverId: string, keyId: string) => {
      if (approverId !== TABLE_APPROVER || keyId !== TABLE_KEY) return null;
      const record: ApprovalIssuerRecord = {
        approverId,
        keyId,
        publicKeyPem,
        revoked: false,
        capabilities: [action],
      } as unknown as ApprovalIssuerRecord;
      return record;
    },
  } as unknown as ApprovalIssuerRepository;
}

/** A table whose read fails, as a database outage would. */
const brokenTable = {
  findIssuer: async () => {
    throw new Error("database unavailable");
  },
} as unknown as ApprovalIssuerRepository;

describe("Approver table unavailable (HTTP boundary, end to end)", () => {
  it("authorizes the approval when the table answers (control)", async () => {
    const { signer, publicKeyPem } = tableSigner();
    const transaction = await withTestApproval(
      await createBusinessTransaction(),
      undefined,
      signer,
    );
    const { app, auditSink } = appWith(
      workingTable(publicKeyPem, transaction.intent.action),
    );

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);
    expect(
      auditSink.events.filter((event) => event.type === "execution.completed")
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("refuses the same approval with 403 POLICY_DENIED when the table read fails", async () => {
    const { signer } = tableSigner();
    const transaction = await withTestApproval(
      await createBusinessTransaction(),
      undefined,
      signer,
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, auditSink } = appWith(brokenTable);

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).toContain("POLICY_DENIED");
    expect(JSON.stringify(response.body)).toContain(
      "do not match independently verified state",
    );
    expect(JSON.stringify(response.body)).not.toContain("database unavailable");
    expect(
      auditSink.events.filter((event) => event.type === "execution.completed")
        .length,
    ).toBe(0);
    expect(
      logged.mock.calls.some(
        ([entry]) =>
          typeof entry === "object" &&
          entry !== null &&
          (entry as { event?: string }).event ===
            "approval_issuer_lookup_failed",
      ),
    ).toBe(true);
  });
});

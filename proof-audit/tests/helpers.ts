//
// Shared harness for the proof audit. Runs the production bootstrap
// (createExecutionSystem -> ExecutionGateway -> connector registry) in
// NODE_ENV=test with memory storage, pointed at a recording Paytm
// connector stand-in (MockPaytmConnectorServer). The stand-in is the
// external endpoint: every request that reaches it is recorded.
//
// Two wrappers sit between the API and the gateway:
//  - capture mode: records the ExecutionRequest the runtime built (a
//    real, Parmana-signed authorization) and then throws, so nothing is
//    released. The proof exists; the external action does not happen.
//  - release mode: records and forwards to the real gateway.
//
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ApprovalArtifactSigner } from "@parmana/crypto";
import {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
} from "@parmana/connector-paytm";

import { createApplication } from "../../packages/api/src/application.js";
import { createApp } from "../../packages/api/src/app.js";
import { createExecutionSystem } from "../../packages/api/src/bootstrap/createExecutionSystem.js";

export const APPROVER = {
  approverId: "manager-priya",
  keyId: "manager-priya-key-1",
};

// Test-only approver key for the approval-issuer mock in each test file.
export const approverKeys = generateKeyPairSync("ed25519");

export interface CapturedRequest {
  readonly businessTransactionId: string;
  readonly action: string;
  readonly target: string;
  readonly parameters: Record<string, unknown>;
  readonly signals?: Record<string, unknown>;
  readonly authorization: any;
}

export interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly server: MockPaytmConnectorServer;
  /** Gateway instance shared by API and direct calls, so nonces are shared. */
  readonly gateway: { execute(request: any): Promise<any> };
  readonly captured: CapturedRequest[];
  mode: "capture" | "release";
}

export async function buildHarness(): Promise<Harness> {
  const server = new MockPaytmConnectorServer({
    sharedSecret: PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
  });
  await server.listen();
  process.env.PAYTM_CONNECTOR_URL = server.baseUrl;
  process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET =
    PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;

  const gateway = await createExecutionSystem();
  const captured: CapturedRequest[] = [];
  const harness: Harness = {
    server,
    gateway,
    captured,
    mode: "capture",
    app: undefined as unknown as ReturnType<typeof createApp>,
  };

  const wrapped = {
    execute: async (request: any) => {
      captured.push(request);
      if (harness.mode === "capture") {
        throw new Error("proof-audit capture mode: not released");
      }
      return gateway.execute(request);
    },
  } as any;

  return Object.assign(harness, {
    app: createApp(createApplication(wrapped), { callerAuth: "disabled" }),
  });
}

export async function closeHarness(harness: Harness): Promise<void> {
  await harness.server.close();
}

export async function signApproval(
  orderId: string,
  maxAmount: number,
  privateKey = approverKeys.privateKey,
) {
  return new ApprovalArtifactSigner().sign(
    {
      approverId: APPROVER.approverId,
      keyId: APPROVER.keyId,
      capability: "paytm:refund",
      resourceId: orderId,
      scope: { field: "value", comparator: "lte", value: maxAmount },
      ttlSeconds: 900,
    },
    privateKey,
  );
}

export async function refundTransaction(options: {
  orderId: string;
  amount: number;
  approvalMax?: number;
}): Promise<any> {
  const id = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const approval = await signApproval(
    options.orderId,
    options.approvalMax ?? options.amount,
  );
  return {
    businessTransactionId: id,
    metadata: {
      businessTransactionId: id,
      correlationId: crypto.randomUUID(),
      createdBy: "proof-audit",
      createdAt: new Date(),
    },
    authority: {
      authorityId,
      authorityType: "USER",
      principalId: "integration-test",
      displayName: "Proof Audit",
      issuedAt: new Date(),
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Proof audit",
      authorizedAt: new Date(),
    },
    intent: {
      intentId,
      authorizationId,
      action: "paytm:refund",
      target: `paytm://orders/${options.orderId}`,
      parameters: {
        orderId: options.orderId,
        transactionId: `TXN-${options.orderId}`,
        amount: options.amount,
      },
      createdAt: new Date(),
    },
    policy: { name: "customer-refund", version: "1.2.0", schemaVersion: "1.0.0" },
    signals: {
      refundEligible: true,
      managerApproved: true,
      fraudCheckPassed: true,
      refundAmount: options.amount,
      approvalArtifact: JSON.parse(JSON.stringify(approval)),
    },
    decision: { outcome: "APPROVED" },
    status: "APPROVED",
    createdAt: new Date(),
  };
}

export function publicKeyPem(): string {
  const dir = process.env.PARMANA_KEY_DIR;
  if (dir === undefined) throw new Error("PARMANA_KEY_DIR not set");
  return readFileSync(join(dir, "default.public.pem"), "utf8");
}

export function paytmCalls(server: MockPaytmConnectorServer): number {
  return server.paytmInvocationCount;
}

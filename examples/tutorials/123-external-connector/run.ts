import crypto, { generateKeyPairSync } from "node:crypto";
import http, { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  SignerBootstrap,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import {
  GatewayAttestationSigner,
  RandomIdGenerator,
  SystemClock,
} from "@parmana/execution-control";
import {
  createPinnedHttpsTransport,
  type ReleaseTransport,
} from "@parmana/execution-gateway";
import { AuthorityType, type ExecutableContent } from "@parmana/shared";

//
// Tutorial 123: connect a system Parmana has no code for, an ERP here,
// as an external connector (ADR-0013).
//
// 1. A maker proposes registering erp:create-invoice to the ERP's
//    endpoint; a checker approves it with a step up signature. Both use
//    the SDK (proposeExternalConnectorChange, approveExternalConnectorChange).
// 2. The ERP runs the endpoint from typescript/examples/07: it checks
//    every release with the SDK's verifyParmanaRelease before acting.
// 3. An approved request is released to it, signed with the server's
//    own key, and the ERP creates the invoice.
// 4. Parmana sends the same release again (as after a timeout): the ERP
//    answers with its first result and does not act twice.
// 5. A release made for another endpoint is refused by the ERP.
// 6. The registration is revoked: the next request is not released.
//
// It starts from an approved authorization. How a request is decided,
// with the policy the registration names at the version approved
// through policy governance and a signed human approval, is Tutorials
// 103, 104 and 119.
//
// The one thing that differs from production: the ERP runs on this
// machine, so the release travels over plain HTTP to 127.0.0.1. In
// production the adapter resolves the registered host, refuses any
// address that is not public, and connects over HTTPS to the address it
// checked.
//
process.env.NODE_ENV = "test";

const ENDPOINT_URL = "https://erp.example.com/parmana/release";

const { createApp } = await import("../../../packages/api/src/app.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createExecutionControl } =
  await import("../../../packages/api/src/bootstrap/createExecutionControl.js");
const { createGatewayIdentity } =
  await import("../../../packages/api/src/bootstrap/createGatewayIdentity.js");
const { createGatewayKeyPair } =
  await import("../../../packages/api/src/bootstrap/createGatewayKeyPair.js");
const { externalConnectorRepository } =
  await import("../../../packages/api/src/repositories.js");
const { hashApiKey } =
  await import("../../../packages/api/src/auth/hashApiKey.js");
const { StaticKeyAuthenticator } =
  await import("../../../packages/api/src/auth/StaticKeyAuthenticator.js");
const { InMemoryCallerAuditSink } =
  await import("../../../packages/api/src/auth/InMemoryCallerAuditSink.js");
const { PolicyChangeStepUpVerifier } =
  await import("../../../packages/api/src/auth/PolicyChangeStepUpVerifier.js");
const { createReleaseHandler } =
  await import("../../../typescript/examples/07-external-connector-endpoint.js");
const { ParmanaClient, signPolicyChangeStepUp } =
  await import("../../../typescript/src/index.js");

console.log();
console.log("==================================================");
console.log("Tutorial 123 - External Connector");
console.log("==================================================");
console.log();

// The ERP host resolves to a public address. The registration refuses a
// host that resolves to a private one.
const lookup = async () => [{ address: "203.0.114.10", family: 4 as const }];

//
// Step 1: register the connector, maker then checker.
//
const MAKER = "tutorial-123-maker-key";
const CHECKER = "tutorial-123-checker-key";
const checkerStepUp = generateKeyPairSync("ed25519");

const app = createApp(createApplication(await createExecutionSystem()), {
  callerAuth: {
    authenticator: new StaticKeyAuthenticator([
      {
        callerId: "maker",
        keyHash: hashApiKey(MAKER),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "checker",
        keyHash: hashApiKey(CHECKER),
        credentialHolderType: AuthorityType.USER,
        stepUpPublicKey: checkerStepUp.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
    ]),
    auditSink: new InMemoryCallerAuditSink(),
  },
  stepUpVerifier: new PolicyChangeStepUpVerifier({
    nonceStore: new MemoryNonceStore(),
  }),
  externalEndpointLookup: lookup,
});

const api = createServer(app);
await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
const apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

async function call(
  method: string,
  path: string,
  key: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

// The maker and the checker use the SDK, each with their own key.
const maker = new ParmanaClient({ endpoint: apiUrl, apiKey: MAKER });
const checker = new ParmanaClient({ endpoint: apiUrl, apiKey: CHECKER });

async function approve(changeId: string) {
  return checker.approveExternalConnectorChange(
    changeId,
    signPolicyChangeStepUp({
      pendingPolicyChangeId: changeId,
      action: "approve",
      privateKeyPem: checkerStepUp.privateKey
        .export({ format: "pem", type: "pkcs8" })
        .toString(),
      keyId: "checker-step-up-key",
    }),
  );
}

console.log("Step 1: register erp:create-invoice, maker then checker");
console.log("--------------------------------------------------");

const proposed = await maker.proposeExternalConnectorChange({
  action: "register",
  capability: "erp:create-invoice",
  endpointUrl: ENDPOINT_URL,
  policy: "erp-invoice",
  allowedParameters: ["amount", "currency"],
  reason: "Finance creates invoices in the ERP through Parmana.",
});
console.log(`Proposed by the maker : ${proposed.status}`);

const ownApproval = await call(
  "POST",
  `/external-connectors/changes/${proposed.changeId}/approve`,
  MAKER,
  {},
);
console.log(
  `Maker approves own   : ${ownApproval.status} ${ownApproval.body.code}`,
);

const approved = await approve(proposed.changeId);
console.log(`Approved by checker  : ${approved.status}`);

const registration = (await checker.externalConnectors()).find(
  (connector) => connector.capability === "erp:create-invoice",
);
console.log(
  `Registration         : ${String(registration?.status)} -> ${String(registration?.endpointUrl)}`,
);
console.log();

//
// Step 2: the ERP's endpoint, typescript/examples/07.
//
console.log("Step 2: the ERP runs the endpoint from the SDK example");
console.log("--------------------------------------------------");

const signer = await SignerBootstrap.create();
const parmanaPublicKey = String(
  (await signer.getPublicKey("default")).export({
    type: "spki",
    format: "pem",
  }),
);

const invoices: string[] = [];
const handle = createReleaseHandler({
  publicKeys: { default: parmanaPublicKey },
  audience: ENDPOINT_URL,
  act: async (release) => {
    const invoiceId = `INV-${invoices.length + 1}`;
    invoices.push(invoiceId);
    return { invoiceId, amount: release.parameters.amount };
  },
});

const erp = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    void handle(JSON.parse(Buffer.concat(chunks).toString("utf8"))).then(
      ({ status, body }) => {
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(body));
      },
    );
  });
});
await new Promise<void>((resolve) => erp.listen(0, "127.0.0.1", resolve));
const erpPort = (erp.address() as AddressInfo).port;
console.log(
  `ERP endpoint listening on 127.0.0.1:${erpPort}, audience ${ENDPOINT_URL}`,
);
console.log();

//
// Step 3: an approved request, released through the production
// Execution Control.
//
const pinned = createPinnedHttpsTransport({ request: http.request });
const sentBodies: string[] = [];
const toLocalErp: ReleaseTransport = (sent) => {
  sentBodies.push(sent.body);
  return pinned({
    ...sent,
    url: new URL(`https://erp.example.com:${erpPort}/parmana/release`),
    addresses: [{ address: "127.0.0.1", family: 4 }],
  });
};

const executionControl = createExecutionControl({
  connectors: externalConnectorRepository,
  adapter: { lookup, transport: toLocalErp },
});

async function approvedRelease(content: ExecutableContent) {
  const decisionKeys = generateKeyPairSync("ed25519");
  const authorization = await new AuthorizationSigner(
    CryptoBootstrap.create(),
  ).sign(
    {
      decisionId: crypto.randomUUID(),
      businessTransactionId: content.businessTransactionId,
      policyName: "erp-invoice",
      policyVersion: "1.0.0",
      grantedCapability: content.action,
      executableContent: content,
    },
    decisionKeys.privateKey,
    "decision-key",
    60,
  );

  return {
    release: {
      authorization,
      executableContent: content,
      verifiedTransaction: {
        authorizationVerified: true as const,
        executableContentVerified: true as const,
        replayCheckPassed: true as const,
      },
      executionTimestamp: new Date().toISOString(),
      approvals: [
        {
          approverId: "manager-x",
          keyId: "manager-x-key-1",
          approvalId: "ap-1",
        },
      ],
    },
    attestation: new GatewayAttestationSigner(
      new SystemClock(),
      new RandomIdGenerator(),
    ).sign(
      createGatewayIdentity().gatewayId,
      authorization.payload.authorizationId,
      createGatewayKeyPair().privateKey,
    ),
  };
}

const invoice: ExecutableContent = {
  businessTransactionId: crypto.randomUUID(),
  action: "erp:create-invoice",
  target: "customer-42",
  parameters: { amount: 1200, currency: "INR" },
};

console.log("Step 3: an approved request is released to the ERP");
console.log("--------------------------------------------------");

const first = await approvedRelease(invoice);
const result = await executionControl.execute(first.release, first.attestation);
const sent = JSON.parse(sentBodies[0] ?? "{}");
console.log(`Release audience     : ${sent.release?.audience}`);
console.log(`Release expires at   : ${sent.release?.expiresAt}`);
console.log(
  `Approved by          : ${sent.release?.approvedBy?.[0]?.approverId}`,
);
console.log(
  `Signature            : ${sent.signature?.algorithm}, key ${sent.signature?.keyId}`,
);
console.log(`Result success       : ${result.success}`);
console.log(`Invoices created     : ${invoices.join(", ")}`);
console.log();

//
// Step 4: the same release again.
//
console.log("Step 4: Parmana sends the same release again");
console.log("--------------------------------------------------");

const again = await fetch(`http://127.0.0.1:${erpPort}/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: sentBodies[0] ?? "{}",
});
const againBody = (await again.json()) as { result?: { invoiceId?: string } };
console.log(
  `ERP answered         : ${again.status}, ${againBody.result?.invoiceId}`,
);
console.log(`Invoices created     : ${invoices.join(", ")}`);
console.log();

//
// Step 5: a release made for another endpoint.
//
console.log("Step 5: a release made for another endpoint");
console.log("--------------------------------------------------");

const elsewhere = createReleaseHandler({
  publicKeys: { default: parmanaPublicKey },
  audience: "https://payroll.example.com/parmana/release",
  act: async () => {
    invoices.push("SHOULD-NOT-HAPPEN");
    return {};
  },
});
const replayed = await elsewhere(JSON.parse(sentBodies[0] ?? "{}"));
console.log(
  `Another endpoint     : ${replayed.status} ${String((replayed.body.errors as string[])[0])}`,
);
console.log();

//
// Step 6: revoke the registration.
//
console.log("Step 6: revoke the registration");
console.log("--------------------------------------------------");

const revoke = await maker.proposeExternalConnectorChange({
  action: "revoke",
  capability: "erp:create-invoice",
  reason: "The ERP integration is retired.",
});
const revoked = await approve(revoke.changeId);
console.log(`Revoke approved      : ${revoked.status}`);

let afterRevoke: string;
try {
  const next = await approvedRelease({
    ...invoice,
    businessTransactionId: crypto.randomUUID(),
  });
  await executionControl.execute(next.release, next.attestation);
  afterRevoke = "released";
} catch (error) {
  afterRevoke = (error as { code?: string }).code ?? String(error);
}
console.log(`Next request         : ${afterRevoke}`);
console.log(`Invoices created     : ${invoices.join(", ")}`);
console.log();

await new Promise<void>((resolve) => erp.close(() => resolve()));
await new Promise<void>((resolve) => api.close(() => resolve()));

if (
  proposed.status === "PENDING_APPROVAL" &&
  ownApproval.status === 403 &&
  approved.status === "APPROVED" &&
  registration?.status === "active" &&
  revoked.status === "APPROVED" &&
  sent.release?.audience === ENDPOINT_URL &&
  result.success === true &&
  again.status === 200 &&
  againBody.result?.invoiceId === "INV-1" &&
  replayed.status === 401 &&
  afterRevoke === "CONNECTOR_NOT_REGISTERED" &&
  invoices.length === 1
) {
  console.log(
    "✓ Registered by two people, released signed, acted on once, refused elsewhere, stopped by a revoke.",
  );
} else {
  console.log("✗ Expected the six steps above to hold.");
  process.exitCode = 1;
}

console.log();
console.log("Tutorial Complete");

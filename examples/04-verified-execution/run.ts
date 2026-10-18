import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import express from "express";

import { FileKeyProvider } from "@parmana/crypto";

import { EnvelopeVerifier, MemoryNonceStore } from "@parmana/envelope-verifier";
import { requireParmanaAuthorization } from "@parmana/envelope-verifier/express";

import { FilePolicyRepository } from "@parmana/policy";

import {
  MemoryBusinessTransactionRepository,
  MemoryExecutionTrustRecordRepository,
} from "@parmana/storage";

import { RuntimeFactory } from "@parmana/runtime";

import type { Connector, ConnectorRequest } from "@parmana/execution-gateway";
import { ExecutionGateway } from "@parmana/execution-gateway";

import type {
  BusinessTransaction,
  ExecutableContent,
  ExecutionResult,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { print, printHeading } from "../shared/helpers/print.js";
import {
  demoApprovalSignalVerifier,
  withDemoApproval,
} from "../shared/helpers/demo-approval.js";

//
// To run this example under the post-quantum provider instead of
// the default (ed25519). Run these from the repository root:
//
//   1. Node >= 24 is required (native node:crypto ml-dsa-65 support).
//   2. Regenerate keys for dilithium3 (do not reuse ed25519 keys —
//      --force overwrites default.private.pem/default.public.pem):
//        node ./node_modules/tsx/dist/cli.mjs \
//          packages/crypto/scripts/generate-keypair.ts \
//          --algorithm dilithium3 --force
//   3. Run with the provider overridden:
//        SIGNATURE_PROVIDER=dilithium3 node ./node_modules/tsx/dist/cli.mjs \
//          examples/04-verified-execution/run.ts
//
// No code in this file changes — selection is entirely through
// SIGNATURE_PROVIDER and which keys are on disk.
//

const root = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(root, "../..");

// Set once the receiving side is listening on a free port.
let RECEIVING_SIDE_URL = "";

/**
 * Resolves the same key directory FileKeyProvider will use, and
 * generates a local ed25519 keypair for this example if the repo's
 * own keys (used by every other package in this repo) are absent —
 * e.g. on a fresh clone. Never hardcodes key material.
 */
function ensureKeysAvailable(): void {
  // A key directory set by the caller (for example scripts/run-examples.ts)
  // wins, as it does for FileKeyProvider.
  const configuredKeysDir = process.env.PARMANA_KEY_DIR;

  if (
    configuredKeysDir &&
    existsSync(path.join(configuredKeysDir, "default.private.pem")) &&
    existsSync(path.join(configuredKeysDir, "default.public.pem"))
  ) {
    return;
  }

  const repoKeysDir = path.join(repoRoot, "keys");

  const repoKeysExist =
    existsSync(path.join(repoKeysDir, "default.private.pem")) &&
    existsSync(path.join(repoKeysDir, "default.public.pem"));

  if (repoKeysExist) {
    return;
  }

  const exampleKeysDir = path.join(root, ".keys");

  const exampleKeysExist =
    existsSync(path.join(exampleKeysDir, "default.private.pem")) &&
    existsSync(path.join(exampleKeysDir, "default.public.pem"));

  if (!exampleKeysExist) {
    console.log(
      `No keys found at ${repoKeysDir}; generating ed25519 keys ` +
        `into ${exampleKeysDir} via generate-keypair.ts ...`,
    );

    execFileSync(
      process.execPath,
      [
        "./node_modules/tsx/dist/cli.mjs",
        path.join(repoRoot, "packages/crypto/scripts/generate-keypair.ts"),
        "--algorithm",
        "ed25519",
      ],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          PARMANA_KEY_DIR: exampleKeysDir,
        },
      },
    );
  }

  process.env.PARMANA_KEY_DIR = exampleKeysDir;
}

/**
 * Records the ConnectorRequest the Execution Gateway forwards
 * downstream, then behaves like @parmana/execution-gateway's
 * reference HttpConnector (POSTs to "<baseUrl>/execute") — except
 * it also records the HTTP response so this example can show it
 * as proof of Scenario 1.
 *
 * This Connector never runs directly: RuntimeFactory.create() is
 * wired with an ExecutionGateway wrapping this Connector, so every
 * request is verified (signature, expiry, TTL, content hash,
 * nonce) before this class ever sees it. The Gateway is the only
 * thing that can call it.
 */
class RecordingHttpConnector implements Connector {
  public lastRequest?: ConnectorRequest;
  public lastResponseStatus?: number;
  public lastResponseBody?: unknown;

  constructor(private readonly baseUrl: string) {}

  async execute(request: ConnectorRequest): Promise<ExecutionResult> {
    this.lastRequest = request;

    const response = await fetch(`${this.baseUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request.transaction,
        authorization: request.authorization,
      }),
    });

    this.lastResponseStatus = response.status;
    this.lastResponseBody = await response.json();

    if (!response.ok) {
      throw new Error(`Execution System returned HTTP ${response.status}.`);
    }

    return {
      businessTransactionId: request.transaction.businessTransactionId,
      action: request.transaction.action,
      target: request.transaction.target,
      parameters: request.transaction.parameters,
      success: true,
      executedAt: new Date(),
      metadata: this.lastResponseBody as Record<string, unknown>,
    };
  }
}

/**
 * RECEIVING SIDE.
 *
 * An independent Express server that never talks to Parmana's
 * runtime or database. It only holds Parmana's public key and
 * verifies incoming envelopes with @parmana/envelope-verifier.
 */
async function startReceivingSide(): Promise<{
  url: string;
  server: Server;
}> {
  const publicKey = await new FileKeyProvider().getPublicKey("default");

  const verifier = new EnvelopeVerifier({
    publicKey,
    nonceStore: new MemoryNonceStore(),
  });

  const app = express();
  app.use(express.json());

  app.post("/execute", requireParmanaAuthorization(verifier), (req, res) => {
    res.status(200).json({
      accepted: true,
      businessTransactionId: (req.body as { businessTransactionId?: string })
        .businessTransactionId,
      checks: req.parmanaAuthorization?.checks,
    });
  });

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  RECEIVING_SIDE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return { url: RECEIVING_SIDE_URL, server };
}

async function postToReceivingSide(
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${RECEIVING_SIDE_URL}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return { status: response.status, body: await response.json() };
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log(" Parmana Example 04 - Verified Execution");
  console.log("========================================");

  ensureKeysAvailable();

  //
  // RECEIVING SIDE starts first so it is ready to receive the
  // request Parmana's runtime forwards during execution below.
  //
  printHeading("RECEIVING SIDE: Starting Verification Server");

  const { server } = await startReceivingSide();

  console.log(`Listening on ${RECEIVING_SIDE_URL}`);

  //
  // PARMANA SIDE: configure the runtime.
  //
  printHeading("PARMANA SIDE: Configure Runtime");

  const transactions = new MemoryBusinessTransactionRepository();
  const trustRecords = new MemoryExecutionTrustRecordRepository();

  const policyRepository = new FilePolicyRepository(
    path.join(repoRoot, "policies"),
  );

  const gatewayPublicKey = await new FileKeyProvider().getPublicKey("default");

  const nonceStore = new MemoryNonceStore();

  const connector = new RecordingHttpConnector(RECEIVING_SIDE_URL);

  const gateway = new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey: gatewayPublicKey,
    nonceStore,
    connector,
  });

  const application = RuntimeFactory.create(
    transactions,
    trustRecords,
    policyRepository,
    gateway,
    undefined,
    demoApprovalSignalVerifier(),
  );

  console.log(
    "Runtime configured with an ExecutionGateway — the sole " +
      "boundary through which Parmana releases approved requests " +
      "to a Connector. Every request is verified (signature, " +
      "expiry, TTL, content hash, nonce) before the Connector " +
      `ever sees it, which forwards to ${RECEIVING_SIDE_URL}.`,
  );

  //
  // PARMANA SIDE: submit an approved Business Transaction.
  //
  printHeading("PARMANA SIDE: Submit Approved Business Transaction");

  const transaction = JSON.parse(
    readFileSync(path.join(root, "transaction.json"), "utf8"),
  ) as BusinessTransaction;

  print("Business Transaction", transaction);

  const trustRecord = await application.execute(
    await withDemoApproval(transaction),
  );

  console.log();
  console.log(
    "Runtime execution complete. This internally: evaluated the " +
      "policy, signed the Execution Authorization, forwarded the " +
      "request to the receiving side (Scenario 1, below), verified " +
      "the resulting Trust Record, and generated a Receipt.",
  );

  const outgoingConnectorRequest = connector.lastRequest!;
  const authorization: SignedExecutionAuthorization =
    outgoingConnectorRequest.authorization;

  const outgoingExecutableContent: ExecutableContent =
    outgoingConnectorRequest.transaction;

  // The flat wire body the Connector actually sent — same shape
  // scenarios 2-5 below use to simulate an attacker who captured
  // (or is trying to forge) a request and bypasses Parmana
  // entirely, posting straight to the receiving side.
  const outgoingWireBody = {
    ...outgoingExecutableContent,
    authorization,
  };

  print(
    "Signed Execution Authorization attached to the outgoing " +
      "ConnectorRequest",
    authorization,
  );

  print(
    "Gateway verification result (recorded on the ConnectorRequest)",
    outgoingConnectorRequest.verification,
  );

  print("Execution Trust Record", trustRecord);

  //
  // Scenario 1 already happened above, as a real HTTP round trip —
  // this is that same result.
  //
  printHeading(
    "RECEIVING SIDE: Scenario 1 - Valid envelope (already happened above)",
  );

  console.log(`HTTP ${connector.lastResponseStatus}`);
  print("Response body", connector.lastResponseBody);

  //
  // Scenario 2: replay the exact same envelope.
  //
  printHeading("RECEIVING SIDE: Scenario 2 - Replayed envelope");

  const replay = await postToReceivingSide(outgoingWireBody);

  console.log(`HTTP ${replay.status}`);
  print("Response body", replay.body);

  //
  // Scenario 3: tamper with the payload after the fact.
  //
  printHeading("RECEIVING SIDE: Scenario 3 - Tampered payload");

  const tamperedRequest = {
    ...outgoingWireBody,
    authorization: {
      ...authorization,
      payload: {
        ...authorization.payload,
        decisionId: "tampered-decision-id",
      },
    },
  };

  const tampered = await postToReceivingSide(tamperedRequest);

  console.log(`HTTP ${tampered.status}`);
  print("Response body", tampered.body);

  //
  // Scenario 4: no authorization at all. This is an agent that skips
  // Parmana and calls the downstream system directly (attacker A8 in
  // THREAT-MODEL.md). Parmana cannot stop that call; a receiver that
  // accepts only Parmana's signed release refuses it.
  //
  printHeading(
    "RECEIVING SIDE: Scenario 4 - Missing authorization (an agent bypasses Parmana)",
  );

  const requestWithoutAuthorization = {
    ...outgoingWireBody,
  };

  delete requestWithoutAuthorization.authorization;

  const missing = await postToReceivingSide(requestWithoutAuthorization);

  console.log(`HTTP ${missing.status}`);
  print("Response body", missing.body);

  //
  // Scenario 5: authorized envelope + modified payload.
  //
  // This is the content-binding gap this session closes: a
  // valid, correctly-signed envelope for this exact
  // businessTransactionId, paired with a payload whose amount
  // was changed after the fact. Unlike scenarios 2-4 (which
  // attack the RECEIVING side directly), this attacks Parmana's
  // own ExecutionGateway — the boundary that must never release
  // this request to a Connector in the first place. Verified
  // with gateway.verify() (not execute()) so it never touches
  // the nonce store, leaving the other scenarios unaffected.
  //
  printHeading(
    "PARMANA SIDE: Scenario 5 - Authorized envelope + modified payload " +
      "(rejected at the Gateway, never reaches the Connector)",
  );

  const modifiedPayloadRequest = {
    businessTransactionId: outgoingExecutableContent.businessTransactionId,
    action: outgoingExecutableContent.action,
    target: outgoingExecutableContent.target,
    parameters: {
      ...outgoingExecutableContent.parameters,
      amount: 50_000,
    },
    authorization,
  };

  const { result: gatewayRejection } = await gateway.verify(
    modifiedPayloadRequest,
  );

  print("Gateway verification result", gatewayRejection);

  console.log();
  console.log(
    `Released to Connector: ${gatewayRejection.valid} ` +
      `(businessTransactionHashMatches: ` +
      `${gatewayRejection.checks.businessTransactionHashMatches})`,
  );

  //
  // Summary.
  //
  printHeading("Summary");

  console.log(
    [
      "1. Valid envelope           -> " +
        `HTTP ${connector.lastResponseStatus} (accepted)`,
      `2. Replayed envelope        -> HTTP ${replay.status} ` +
        "(nonceUnseen: false)",
      `3. Tampered payload         -> HTTP ${tampered.status} ` +
        "(signatureVerified: false)",
      `4. Missing authorization    -> HTTP ${missing.status} ` +
        "(an agent calling directly, bypassing Parmana)",
      "5. Authorized + modified    -> rejected at the Gateway " +
        `(valid: ${gatewayRejection.valid}, ` +
        `businessTransactionHashMatches: ` +
        `${gatewayRejection.checks.businessTransactionHashMatches})`,
    ].join("\n"),
  );

  server.close();

  // npm run examples runs this file: fail it if any outcome changes.
  const unexpected = [
    connector.lastResponseStatus === 200 ? undefined : "1 not accepted",
    replay.status === 403 ? undefined : "2 replay not refused",
    tampered.status === 403 ? undefined : "3 tampered payload not refused",
    missing.status === 401 ? undefined : "4 direct call not refused",
    gatewayRejection.valid === false
      ? undefined
      : "5 modified payload released",
  ].filter((failure) => failure !== undefined);

  if (unexpected.length > 0) {
    throw new Error(`Unexpected outcome: ${unexpected.join("; ")}`);
  }

  console.log();
  console.log("Example Complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

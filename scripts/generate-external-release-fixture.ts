import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";

import {
  CryptoBootstrap,
  LocalFileSigner,
  commitmentMessage,
  requiresCommitment,
  type Signer,
} from "@parmana/crypto";
import {
  GatewayExternalAdapter,
  type ReleaseTransport,
} from "@parmana/execution-gateway";

/**
 * Generates external connector releases (ADR-0013) signed by the real
 * server code, for the SDK helpers verifyParmanaRelease (TypeScript) and
 * verify_parmana_release (Python). Both SDK test suites run this script
 * and verify what it writes; neither signs a release itself.
 *
 * Usage:
 *   npx tsx scripts/generate-external-release-fixture.ts <out-dir>
 *
 * Writes to <out-dir>:
 *   release.json        the body GatewayExternalAdapter POSTs, signed raw
 *   release-large.json  a release over 4096 canonical bytes, signed over
 *                       the commitment as KmsSigner signs it (ADR-0010)
 *   public-key.pem      the key that verifies both
 *   fixture.json        { audience, now }: the endpoint URL and a moment
 *                       inside the releases' 60 second validity
 *
 * Uses an ephemeral key pair under its own key id, so it never touches
 * other key material, and no network: DNS and the transport are stubs.
 */

const [outDir] = process.argv.slice(2);

if (!outDir) {
  console.error("Usage: generate-external-release-fixture.ts <out-dir>");
  process.exit(2);
}

const keyId = "external-release-fixture";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

process.env.PARMANA_KEY_DIR = outDir;
process.env.PARMANA_VERIFICATION_KEY_ID = keyId;
process.env.PARMANA_POLICY_DIR = outDir;

writeFileSync(
  `${outDir}/${keyId}.private.pem`,
  privateKey.export({ format: "pem", type: "pkcs8" }),
);
writeFileSync(
  `${outDir}/${keyId}.public.pem`,
  publicKey.export({ format: "pem", type: "spki" }),
);
writeFileSync(
  `${outDir}/public-key.pem`,
  publicKey.export({ format: "pem", type: "spki" }),
);

const audience = "https://erp.example.com/parmana/release";
const issuedAt = new Date("2026-10-01T10:00:00.000Z");

/**
 * The production file signer, and the same signer signing over the
 * commitment above 4096 bytes exactly as KmsSigner does.
 */
const fileSigner = new LocalFileSigner(CryptoBootstrap.create());
const kmsLikeSigner: Signer = {
  sign: (id, data) =>
    fileSigner.sign(
      id,
      requiresCommitment(data) ? commitmentMessage(data) : data,
    ),
  getPublicKey: (id) => fileSigner.getPublicKey(id),
  getMetadata: (id) => fileSigner.getMetadata(id),
  hasKey: (id) => fileSigner.hasKey(id),
};

async function release(
  signer: Signer,
  parameters: Record<string, unknown>,
): Promise<string> {
  let body = "";
  const transport: ReleaseTransport = async (sent) => {
    body = sent.body;
    return {
      status: 200,
      body: JSON.stringify({
        businessTransactionId: "fixture-bt-1",
        capability: "erp:create-invoice",
        success: true,
        result: {},
      }),
    };
  };

  await new GatewayExternalAdapter({
    target: {
      capability: "erp:create-invoice",
      endpointUrl: audience,
      allowedParameters: Object.keys(parameters),
      timeoutMs: 10_000,
    },
    signer,
    keyId,
    lookup: async () => [{ address: "203.0.114.10", family: 4 }],
    transport,
    now: () => issuedAt,
  }).execute(
    {
      capability: "erp:create-invoice",
      businessTransactionId: "fixture-bt-1",
      action: "erp:create-invoice",
      target: "customer-café-42",
      parameters,
    },
    {
      credential: {} as never,
      timeoutMs: 10_000,
      requestedAt: issuedAt,
      release: {
        authorizationId: "fixture-authorization",
        policy: {
          name: "erp-invoice",
          version: "1.0.0",
          contentHash: "policy-content-hash",
        },
        approvals: [
          {
            approverId: "manager-x",
            keyId: "manager-x-key-1",
            approvalId: "fixture-approval",
          },
        ],
      },
    },
  );

  return JSON.stringify(JSON.parse(body), null, 2);
}

writeFileSync(
  `${outDir}/release.json`,
  await release(fileSigner, { amount: 1200, currency: "INR" }),
);
writeFileSync(
  `${outDir}/release-large.json`,
  await release(kmsLikeSigner, {
    amount: 1200,
    currency: "INR",
    memo: "x".repeat(5000),
  }),
);
writeFileSync(
  `${outDir}/fixture.json`,
  JSON.stringify(
    { audience, now: new Date(issuedAt.getTime() + 10_000).toISOString() },
    null,
    2,
  ),
);

console.log(
  `Wrote release.json, release-large.json, public-key.pem and fixture.json to ${outDir}`,
);

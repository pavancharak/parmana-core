/**
 * Builds the conformance vectors that consumers (parmana-connect, parmana-connectors) verify in CI.
 *
 * Every signature is made by parmana-core's own code: CanonicalSerializer for the bytes, the
 * signature provider of VerificationCrypto for the signature, and SignatureCommitment for
 * messages over the KMS limit, as the gateway and the signal source do. Nothing here is signed by hand.
 *
 * The vectors are deterministic: the test key comes from a fixed seed, the timestamps and nonces
 * are fixed, and the payloads are built from fixed values. Running this twice gives the same bytes.
 *
 * The key is a TEST key (see TEST_KEY_ID). It is public in this repository by design. It must never
 * be loaded by a production configuration. The test in conformance-vectors.test.ts checks the file
 * is byte-identical to a fresh build.
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";

import {
  ArtifactSigner,
  CanonicalSerializer,
  commitmentMessage,
  requiresCommitment,
  type CryptoProvider,
} from "@parmana/crypto";

export const CORE_VERSION = "5.0.0";
export const TEST_KEY_ID = "conformance-test-1";
export const AUDIENCE = "https://parmana-connect.example.com/execute";
export const SOURCE_AUDIENCE = "https://orders.example.com/parmana/signals";

const TEST_SEED = Buffer.from(
  "parmana conformance test key 1".padEnd(32, "."),
  "utf8",
);
const PKCS8_ED25519_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

export function testKeyPair(): {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyPem: string;
} {
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, TEST_SEED]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

const serializer = new CanonicalSerializer();

/** The vectors as data, before they are written to disk. */
export interface ConformanceVectors {
  readonly format: "parmana-conformance-vectors";
  readonly formatVersion: 1;
  readonly coreVersion: string;
  readonly signer: {
    readonly keyId: string;
    readonly algorithm: "ed25519";
    readonly publicKeyPem: string;
    readonly testKey: true;
    readonly note: string;
  };
  readonly vectors: readonly ConformanceVector[];
}

export type ConformanceVector =
  | {
      readonly name: string;
      readonly kind: "external-release";
      readonly input: unknown;
      /** Canonical bytes of the input, base64. */
      readonly canonical: string;
      /** True when the signature covers a SHA-512 commitment, not the canonical bytes. */
      readonly commitment: boolean;
      readonly signature: {
        readonly algorithm: "ed25519";
        readonly keyId: string;
        readonly value: string;
      };
    }
  | {
      readonly name: string;
      readonly kind: "signed-authorization";
      readonly input: unknown;
      readonly canonical: string;
      readonly commitment: false;
      readonly signature: {
        readonly algorithm: "ed25519";
        readonly keyId: string;
        readonly value: string;
      };
    }
  | {
      readonly name: string;
      readonly kind: "signal-query";
      readonly input: unknown;
      readonly canonical: string;
      readonly commitment: false;
      readonly signature: {
        readonly algorithm: "ed25519";
        readonly keyId: string;
        readonly value: string;
      };
    };

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Builds every vector with parmana-core's signing code. `crypto` is the production provider
 * (VerificationCrypto); the generator and the test both pass one in.
 */
export async function buildConformanceVectors(
  crypto: CryptoProvider,
): Promise<ConformanceVectors> {
  const { privateKey, publicKeyPem } = testKeyPair();
  const artifactSigner = new ArtifactSigner(crypto, serializer);
  const algorithm = "ed25519" as const;

  // A release the connect service verifies. The small one is signed as raw bytes.
  const smallRelease = {
    version: 1,
    connectorId: "ext-example:item-fetch",
    audience: AUDIENCE,
    businessTransactionId: "conformance-small",
    authorizationId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    capability: "example:item-fetch",
    target: "items/123",
    parameters: { itemId: "123", unicode: "naïve ✓" },
    policy: { name: "policy-a", version: "1.0.0" },
    approvedBy: [],
    issuedAt: "2026-10-29T05:59:30.000Z",
    expiresAt: "2026-10-29T06:00:30.000Z",
  };

  // A large release is over the KMS raw limit, so its signature covers a commitment.
  const largeRelease = {
    ...smallRelease,
    businessTransactionId: "conformance-large",
    parameters: { itemId: "456", note: "x".repeat(5000) },
  };

  const release = async (
    name: string,
    body: unknown,
  ): Promise<ConformanceVector> => {
    const canonical = serializer.serialize(body);
    const commitment = requiresCommitment(canonical);
    const message = commitment ? commitmentMessage(canonical) : canonical;
    const value = await crypto.signature.sign(message, privateKey);
    return {
      name,
      kind: "external-release",
      input: body,
      canonical: Buffer.from(canonical).toString("base64"),
      commitment,
      signature: { algorithm, keyId: TEST_KEY_ID, value },
    };
  };

  // A signed authorization for the connect bearer-token path. The payload is fixed; the signing
  // is the same ArtifactSigner call AuthorizationSigner makes.
  const authorizationPayload = {
    version: 1,
    authorizationId: "11111111-2222-4333-8444-555555555555",
    nonce: "conformance-nonce-0001",
    decisionId: "conformance-decision-0001",
    decisionOutcome: "APPROVED",
    businessTransactionId: "conformance-btx-0001",
    policyName: "policy-a",
    policyVersion: "1.0.0",
    authorizedAt: "2026-10-29T05:59:00.000Z",
    expiresAt: "2026-10-29T06:04:00.000Z",
    businessTransactionHash: sha256Hex("conformance-btx-0001"),
    grantedCapability: "example:item-fetch",
  };
  const authorizationValue = await artifactSigner.sign(
    authorizationPayload,
    privateKey,
  );

  // A signed signal query, as the business signal source receives it.
  const signalQuery = {
    version: 1,
    source: "orders-system",
    audience: SOURCE_AUDIENCE,
    signalKey: "orderShipped",
    claim: "order.shipped",
    subject: "ORD-1001",
    action: "example:item-fetch",
    businessTransactionId: "conformance-btx-0001",
    nonce: "conformance-query-nonce-0001",
    parameters: { amount: 4200 },
    issuedAt: "2026-10-29T05:59:00.000Z",
    expiresAt: "2026-10-29T06:00:00.000Z",
  };
  const queryValue = await artifactSigner.sign(signalQuery, privateKey);

  return {
    format: "parmana-conformance-vectors",
    formatVersion: 1,
    coreVersion: CORE_VERSION,
    signer: {
      keyId: TEST_KEY_ID,
      algorithm,
      publicKeyPem,
      testKey: true,
      note: "Test key from a fixed seed in parmana-core. Not a production key. Never load it in a production configuration.",
    },
    vectors: [
      await release("release-small", smallRelease),
      await release("release-large-commitment", largeRelease),
      {
        name: "authorization-bearer",
        kind: "signed-authorization",
        input: authorizationPayload,
        canonical: Buffer.from(
          serializer.serialize(authorizationPayload),
        ).toString("base64"),
        commitment: false,
        signature: { algorithm, keyId: TEST_KEY_ID, value: authorizationValue },
      },
      {
        name: "signal-query",
        kind: "signal-query",
        input: signalQuery,
        canonical: Buffer.from(serializer.serialize(signalQuery)).toString(
          "base64",
        ),
        commitment: false,
        signature: { algorithm, keyId: TEST_KEY_ID, value: queryValue },
      },
    ],
  };
}

/** The exact file contents: pretty JSON with a final newline, so a regenerated file can be compared byte for byte. */
export function serializeVectors(vectors: ConformanceVectors): string {
  return `${JSON.stringify(vectors, null, 2)}\n`;
}

/** Where the committed file lives, named by core version (RFC-0033, Phase 1). */
export const VECTORS_FILE = `tests/conformance/vectors/parmana-core-${CORE_VERSION}.json`;

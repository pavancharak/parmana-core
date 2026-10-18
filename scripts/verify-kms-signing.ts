import "dotenv/config";

import { randomBytes, verify } from "node:crypto";

import { KMSClient, SignCommand } from "@aws-sdk/client-kms";

import {
  KmsSigner,
  commitmentMessage,
  requiresCommitment,
} from "@parmana/crypto";

/**
 * Checks that AWS KMS signing works with the credentials in this shell, on both
 * sides of the 4096 byte raw message limit.
 *
 * It uses the repository's own KmsSigner, so it exercises the same code path the
 * server uses. It signs only random test data, and it changes nothing in AWS.
 * Each run makes about seven kms:Sign calls plus one kms:GetPublicKey and one
 * kms:DescribeKey.
 *
 * Credentials come from the standard AWS chain, for example AWS_PROFILE. A set
 * AWS_ROLE_ARN would make KmsSigner use the Vercel OIDC token, which only exists
 * on Vercel, so this script clears it and says so.
 *
 * Usage:
 *   AWS_REGION=ap-south-1 AWS_PROFILE=parmana npm run verify:kms
 *   AWS_REGION=ap-south-1 AWS_PROFILE=parmana npm run verify:kms -- --key-id default
 *
 * Exit code 0 means every check passed. Any other code means at least one failed.
 */

const RAW_LIMIT_CONTROL_BYTES = 5000;

interface Outcome {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

function argument(args: readonly string[], name: string, fallback: string) {
  const index = args.indexOf(name);

  if (index === -1) return fallback;

  const value = args[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 200);
  }

  return String(error).slice(0, 200);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keyId = argument(args, "--key-id", "default");
  const region = process.env.AWS_REGION;

  if (region === undefined || region === "") {
    throw new Error("AWS_REGION is not set, for example ap-south-1.");
  }

  if (process.env.AWS_ROLE_ARN !== undefined) {
    console.log(
      "Note: AWS_ROLE_ARN is set. Ignoring it, because it selects the Vercel OIDC token, " +
        "which only exists on Vercel. Using the standard AWS credential chain instead.",
    );
    delete process.env.AWS_ROLE_ARN;
  }

  console.log(`Key id: ${keyId}   Region: ${region}`);
  console.log(`Profile: ${process.env.AWS_PROFILE ?? "(default chain)"}`);
  console.log("");

  const outcomes: Outcome[] = [];
  const signer = await KmsSigner.create(region);

  const metadata = await signer.getMetadata(keyId);

  outcomes.push({
    name: "Key is an Ed25519 signing key",
    passed: metadata.algorithm === "ed25519",
    detail: `algorithm ${metadata.algorithm}`,
  });

  const publicKey = await signer.getPublicKey(keyId);

  const cases: ReadonlyArray<readonly [string, number]> = [
    ["Signs 300 bytes as they are", 300],
    ["Signs 4096 bytes as they are (the limit)", 4096],
    ["Signs 5000 bytes as a 97 byte commitment", 5000],
    ["Signs 60000 bytes as a 97 byte commitment", 60000],
  ];

  for (const [name, size] of cases) {
    const data = randomBytes(size);
    const commitment = requiresCommitment(data);
    const signature = await signer.sign(keyId, data);
    const signedBytes = commitment ? commitmentMessage(data) : data;
    const valid = verify(
      null,
      Buffer.from(signedBytes),
      publicKey,
      Buffer.from(signature, "base64"),
    );

    outcomes.push({
      name,
      passed: valid && commitment === size > 4096,
      detail: `commitment ${commitment}, ${signedBytes.length} bytes signed, verifies ${valid}`,
    });
  }

  const other = await signer.sign(keyId, randomBytes(300));
  const wrongDataVerifies = verify(
    null,
    Buffer.from(randomBytes(300)),
    publicKey,
    Buffer.from(other, "base64"),
  );

  outcomes.push({
    name: "A signature does not verify over different data",
    passed: !wrongDataVerifies,
    detail: `verifies ${wrongDataVerifies}`,
  });

  // Control: the same size sent straight to KMS with no commitment must be
  // refused. It proves the limit is real and the commitment is needed.
  try {
    await new KMSClient({ region }).send(
      new SignCommand({
        KeyId:
          keyId.startsWith("arn:") || keyId.startsWith("alias/")
            ? keyId
            : `alias/${keyId}`,
        Message: randomBytes(RAW_LIMIT_CONTROL_BYTES),
        MessageType: "RAW",
        SigningAlgorithm: "ED25519_SHA_512",
      }),
    );

    outcomes.push({
      name: `KMS refuses ${RAW_LIMIT_CONTROL_BYTES} raw bytes (control)`,
      passed: false,
      detail: "KMS accepted it, so the 4096 byte limit no longer applies here",
    });
  } catch (error) {
    const refused =
      error instanceof Error && error.name === "ValidationException";

    outcomes.push({
      name: `KMS refuses ${RAW_LIMIT_CONTROL_BYTES} raw bytes (control)`,
      passed: refused,
      detail: describeError(error),
    });
  }

  for (const outcome of outcomes) {
    console.log(
      `${outcome.passed ? "PASS" : "FAIL"}  ${outcome.name}  (${outcome.detail})`,
    );
  }

  const failed = outcomes.filter((outcome) => !outcome.passed).length;

  console.log("");

  if (failed === 0) {
    console.log(`All ${outcomes.length} checks passed.`);
    return;
  }

  console.error(`${failed} of ${outcomes.length} checks failed.`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});

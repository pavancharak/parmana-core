import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";

/**
 * Generates an approver's Ed25519 key pair for signing Approval
 * Artifacts (scripts/sign-approval.ts).
 *
 * Run by the approver, on their own machine. The private key never
 * leaves it. The public key is then trusted through maker checker
 * (POST /approval-issuers/changes, docs/site/guides/manage-approvers.mdx),
 * with no deploy. Listing it in TRUSTED_APPROVAL_ISSUERS in
 * packages/api/src/bootstrap/codeApprovalIssuers.ts still works, with a
 * pull request and a deploy. The file
 * is also named the way the server loads it from
 * $PARMANA_KEY_DIR/approval-issuers/, for deployments that use files.
 *
 * Usage:
 *   npx tsx scripts/generate-approver-key.ts \
 *     --approver-id manager-priya \
 *     --key-id manager-priya-key-1 \
 *     --out-dir ~/.parmana
 */

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export interface ApproverKeyFiles {
  readonly privateKeyPath: string;
  readonly publicKeyPath: string;
}

export function approverKeyFileNames(
  outDir: string,
  approverId: string,
  keyId: string,
): ApproverKeyFiles {
  for (const [name, value] of [
    ["--approver-id", approverId],
    ["--key-id", keyId],
  ]) {
    if (!ID_PATTERN.test(value)) {
      throw new Error(
        `${name} must use only letters, digits, ".", "_" and "-": ${value}`,
      );
    }
  }

  const base = `${approverId}__${keyId}`;

  return {
    privateKeyPath: join(outDir, `${base}.private.pem`),
    publicKeyPath: join(outDir, `${base}.public.pem`),
  };
}

export function generateApproverKey(
  outDir: string,
  approverId: string,
  keyId: string,
): ApproverKeyFiles {
  const files = approverKeyFileNames(outDir, approverId, keyId);

  for (const path of [files.privateKeyPath, files.publicKeyPath]) {
    if (existsSync(path)) {
      throw new Error(`Refusing to overwrite an existing key file: ${path}`);
    }
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  writeFileSync(
    files.privateKeyPath,
    privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    { mode: 0o600 },
  );
  writeFileSync(
    files.publicKeyPath,
    publicKey.export({ format: "pem", type: "spki" }).toString(),
  );

  return files;
}

function argument(args: string[], name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

function main(args = process.argv.slice(2)): void {
  try {
    const approverId = argument(args, "--approver-id");
    const keyId = argument(args, "--key-id");
    const outDir = argument(args, "--out-dir");

    const files = generateApproverKey(outDir, approverId, keyId);

    console.log();
    console.log(
      `Private key (keep it on this machine): ${files.privateKeyPath}`,
    );
    console.log(
      `Public key (give it to your operator): ${files.publicKeyPath}`,
    );
    console.log();
    console.log(
      `To trust it, one person proposes adding approver "${approverId}", key "${keyId}", with this public key`,
    );
    console.log(
      "(POST /approval-issuers/changes) and a different person approves it. See docs/site/guides/manage-approvers.mdx.",
    );
    console.log();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.env.VITEST === undefined) {
  main();
}

export { main };

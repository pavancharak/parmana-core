/**
 * Makes every key the public sandbox needs (ADR-0014), as files in one
 * new folder, and prints only their names. Nothing here is a production
 * key, and nothing is shared with production.
 *
 *   npx tsx deploy/sandbox/make-keys.ts --out D:\key\parmana-sandbox
 *
 * Writes:
 *
 *   key-material.json            PARMANA_KEY_MATERIAL_JSON: the sandbox's own
 *                                signing keys, "default" and "gateway"
 *   PARMANA_API_KEYS.json        hashes only, for the three callers below
 *   sandbox-maker.key            raw API key, human (proposes changes)
 *   sandbox-checker.key          raw API key, human (approves changes)
 *   sandbox-checker.step-up.private.pem   the checker's step up key
 *   sandbox-visitor.key          raw API key, sandbox:receipt only; this one
 *                                is published in the docs
 *   sandbox-demo-approver__sandbox-demo-approver-key-1.private.pem
 *   sandbox-demo-approver__sandbox-demo-approver-key-1.public.pem
 *                                the demo approver behind POST /sandbox/approvals
 *
 * Refuses a folder that already has files, so it never overwrites a key.
 */

import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

// The two generator scripts run their command line when imported, unless
// NODE_ENV is "test". Only their exported functions are used here.
process.env.NODE_ENV = "test";

const { generateApiKey } = await import("../../scripts/generate-api-key.js");
const { generateApproverKey } =
  await import("../../scripts/generate-approver-key.js");
const { AuthorityType } = await import("@parmana/shared");

const index = process.argv.indexOf("--out");
const out = index === -1 ? undefined : process.argv[index + 1];

if (out === undefined) {
  throw new Error("Pass --out <a new, empty folder>.");
}

if (existsSync(out) && readdirSync(out).length > 0) {
  throw new Error(`${out} already has files. Use a new, empty folder.`);
}

mkdirSync(out, { recursive: true });

const written: string[] = [];

function write(name: string, content: string): void {
  writeFileSync(join(out as string, name), content, { mode: 0o600 });
  written.push(name);
}

function ed25519Pair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  return {
    privateKeyPem: privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString(),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

write(
  "key-material.json",
  `${JSON.stringify({ default: ed25519Pair(), gateway: ed25519Pair() })}\n`,
);

const maker = generateApiKey({
  callerId: "sandbox-maker",
  credentialHolderType: AuthorityType.USER,
});
const checker = generateApiKey({
  callerId: "sandbox-checker",
  credentialHolderType: AuthorityType.USER,
  generateStepUpKey: true,
});
const visitor = generateApiKey({
  callerId: "sandbox-visitor",
  allowedCapabilities: ["sandbox:receipt"],
});

write(
  "PARMANA_API_KEYS.json",
  `${JSON.stringify([maker.entry, checker.entry, visitor.entry])}\n`,
);
write("sandbox-maker.key", `${maker.rawKey}\n`);
write("sandbox-checker.key", `${checker.rawKey}\n`);
write("sandbox-checker.step-up.private.pem", checker.stepUpPrivateKey ?? "");
write("sandbox-visitor.key", `${visitor.rawKey}\n`);

const approver = generateApproverKey(
  out,
  "sandbox-demo-approver",
  "sandbox-demo-approver-key-1",
);
written.push(
  basename(approver.privateKeyPath),
  basename(approver.publicKeyPath),
);

console.log(`Wrote ${written.length} files to ${out}:`);
for (const name of written) console.log(`  ${name}`);
console.log(
  "\nNo key was printed. Keep the folder private; only sandbox-visitor.key is meant to be published.",
);

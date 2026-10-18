import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileKeyProvider, CryptoError } from "@parmana/crypto";

//
// FileKeyProvider resolves a keyId to a filename on disk
// (`${PARMANA_KEY_DIR}/${keyId}.private.pem`). Without sanitization, a
// keyId like "../../../../etc/passwd" would resolve outside the key
// directory entirely -- a classic path-traversal shape. This tutorial
// proves every one of FileKeyProvider's four methods rejects it before
// ever touching the filesystem.
//
const keyDir = mkdtempSync(join(tmpdir(), "parmana-tutorial-87-keys-"));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(
  join(keyDir, "default.private.pem"),
  privateKey.export({ format: "pem", type: "pkcs8" }),
);
writeFileSync(
  join(keyDir, "default.public.pem"),
  publicKey.export({ format: "pem", type: "spki" }),
);
process.env.PARMANA_KEY_DIR = keyDir;

console.log();
console.log("==================================================");
console.log("Tutorial 87 - Key Provider Path Traversal");
console.log("==================================================");
console.log();

try {
  const provider = new FileKeyProvider();
  const TRAVERSAL_KEY_ID = "../../../../etc/passwd";

  const results: Record<
    string,
    { rejected: boolean; isCryptoError: boolean; message: string }
  > = {};

  console.log(
    `Attempting every FileKeyProvider method with keyId = "${TRAVERSAL_KEY_ID}"`,
  );
  console.log("--------------------------------------------------");

  for (const method of [
    "getPrivateKey",
    "getPublicKey",
    "hasKey",
    "getMetadata",
  ] as const) {
    try {
      await provider[method](TRAVERSAL_KEY_ID);
      results[method] = {
        rejected: false,
        isCryptoError: false,
        message: "(no error thrown)",
      };
    } catch (error) {
      results[method] = {
        rejected: true,
        isCryptoError: error instanceof CryptoError,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    console.log(
      `${method.padEnd(14)} -> rejected: ${results[method]!.rejected}, CryptoError: ${results[method]!.isCryptoError}`,
    );
    console.log(`  ${results[method]!.message}`);
  }
  console.log();

  console.log(
    'Control: the well-formed "default" keyId this tutorial actually generated still works',
  );
  console.log("--------------------------------------------------");
  const wellFormedWorks = await provider.hasKey("default");
  console.log(`hasKey("default") -> ${wellFormedWorks}`);
  console.log();

  const allPassed =
    Object.values(results).every(
      (r) =>
        r.rejected && r.isCryptoError && r.message.includes("Invalid keyId"),
    ) && wellFormedWorks === true;

  if (allPassed) {
    console.log(
      "✓ Every method rejects a path-traversal keyId by name, with a CryptoError naming the problem -- well-formed keyIds are unaffected.",
    );
  } else {
    console.log(
      "✗ Expected every traversal attempt to be rejected as a named CryptoError, and the well-formed keyId to still resolve.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 88 - Malformed Request Handling");
} finally {
  delete process.env.PARMANA_KEY_DIR;
  rmSync(keyDir, { recursive: true, force: true });
}

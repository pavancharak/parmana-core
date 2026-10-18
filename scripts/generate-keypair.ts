import "dotenv/config";

import { generateKeyPairSync } from "node:crypto";

import { existsSync } from "node:fs";

import { join } from "node:path";

import {
  assertSafeKeyId,
  ensureKeyDirectory,
  PRIVATE_KEY_MODE,
  PUBLIC_KEY_MODE,
  writeKeyFile,
} from "./lib/key-files.js";

const args = process.argv.slice(2);

function argument(name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

const algorithm = argument("--algorithm");

const keyId = assertSafeKeyId(argument("--key-id"));

const force = args.includes("--force");

const keyDirectory = process.env.PARMANA_KEY_DIR ?? "./keys";

ensureKeyDirectory(keyDirectory);

//
// "ml-dsa-65" (the NIST/FIPS 204 standard name) is accepted as an
// input alias for "dilithium3" (this codebase's internal identifier,
// unchanged for backward compatibility with existing
// SIGNATURE_PROVIDER=dilithium3 deployments) -- see
// ConfigValidation.ts's parseSignatureAlgorithm for the same alias on
// the config-parsing side.
//
const nodeAlgorithm =
  algorithm === "ed25519"
    ? "ed25519"
    : algorithm === "dilithium3" || algorithm === "ml-dsa-65"
      ? "ml-dsa-65"
      : undefined;

if (!nodeAlgorithm) {
  throw new Error(`Unsupported algorithm: ${algorithm}`);
}

const { publicKey, privateKey } = generateKeyPairSync(nodeAlgorithm);

const privatePem = privateKey.export({
  format: "pem",
  type: "pkcs8",
}) as string;

const publicPem = publicKey.export({
  format: "pem",
  type: "spki",
}) as string;

const privatePath = join(keyDirectory, `${keyId}.private.pem`);

const publicPath = join(keyDirectory, `${keyId}.public.pem`);

if (!force && (existsSync(privatePath) || existsSync(publicPath))) {
  throw new Error(
    `Key material already exists at "${keyDirectory}" ` +
      `(${keyId}.private.pem / ${keyId}.public.pem). Refusing to ` +
      "overwrite existing keys -- pass --force to regenerate.",
  );
}

writeKeyFile(privatePath, privatePem, PRIVATE_KEY_MODE, force);

writeKeyFile(publicPath, publicPem, PUBLIC_KEY_MODE, force);

console.log();
console.log("Key pair generated");
console.log("--------------------------------");
console.log("Algorithm :", algorithm);
console.log("Key ID    :", keyId);
console.log("Directory :", keyDirectory);
console.log("Private   :", privatePath);
console.log("Public    :", publicPath);
console.log();

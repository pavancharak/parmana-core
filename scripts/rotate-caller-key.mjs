#!/usr/bin/env node
import { randomBytes, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

// Rotates a single caller's API key in an existing .flysecrets*-style
// directory. Never prints a value -- only file paths and the caller id.
//
// The previous raw key is preserved alongside the new one (as
// <key-file>.OLD) so the old-key-now-rejected / new-key-now-accepted
// pair can both be tested without needing to have copied the old
// value out beforehand.

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing argument: ${name}`);
  }
  return process.argv[index + 1];
}

const callerId = argument("--caller-id");

// The caller id becomes part of a file name, so it gets the same allowlist as
// key ids (scripts/lib/key-files.ts). "../" must not reach writeFileSync.
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(callerId)) {
  throw new Error(
    `Unsafe caller id "${callerId}": use 1 to 64 letters, digits, ".", "_" or "-", starting with a letter or digit.`,
  );
}
const secretsDir = argument("--secrets-dir");
const secretsFile = join(secretsDir, "secrets.env");
const keyFile = join(secretsDir, `${callerId}-api-key.txt`);
const legacyKeyFile = join(secretsDir, "smoke-test-api-key.txt");
const activeKeyFile =
  existsSync(legacyKeyFile) && callerId === "smoke-test"
    ? legacyKeyFile
    : keyFile;

if (!existsSync(secretsFile)) {
  throw new Error(`Secrets file not found: ${secretsFile}`);
}

const lines = readFileSync(secretsFile, "utf8").split("\n");
const apiKeysLineIndex = lines.findIndex((l) =>
  l.startsWith("PARMANA_API_KEYS="),
);

if (apiKeysLineIndex === -1) {
  throw new Error(`PARMANA_API_KEYS= line not found in ${secretsFile}`);
}

const existingApiKeys = JSON.parse(
  lines[apiKeysLineIndex].slice("PARMANA_API_KEYS=".length),
);

const rawKey = randomBytes(32).toString("base64url");
const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

const updatedApiKeys = [
  ...existingApiKeys.filter((entry) => entry.callerId !== callerId),
  { callerId, keyHash },
];

lines[apiKeysLineIndex] = `PARMANA_API_KEYS=${JSON.stringify(updatedApiKeys)}`;

if (existsSync(activeKeyFile)) {
  copyFileSync(activeKeyFile, `${activeKeyFile}.OLD`);
}

writeFileSync(activeKeyFile, rawKey + "\n", { mode: 0o600 });
writeFileSync(secretsFile, lines.join("\n"), { mode: 0o600 });

console.log("Rotated (no values printed):");
console.log(`  ${secretsFile}`);
console.log(
  `    PARMANA_API_KEYS updated: callerId "${callerId}" now maps to a freshly generated hash`,
);
console.log(`  ${activeKeyFile}`);
console.log(`    new raw key for callerId "${callerId}"`);
console.log(`  ${activeKeyFile}.OLD`);
console.log(
  `    previous raw key, kept for negative verification (should 401 after import + restart)`,
);

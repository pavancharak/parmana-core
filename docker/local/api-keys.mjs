// Manages the API keys of the self hosted deployment (docker-compose.yml).
//
// Runs inside the API image, through the `setup` service, so the host needs
// only Docker and nobody edits parmana-local/api-keys.json by hand:
//
//   docker compose run --rm --no-deps --entrypoint node setup \
//     /app/docker/local/api-keys.mjs <command> [options]
//
// Commands (use `docker compose run -T ...` when piping into --step-up-public-key-stdin):
//
//   list
//       Prints every entry: caller ID, credential holder type, allowed
//       capabilities, allowed principal IDs, and whether it has a step up
//       key. Never prints a key or a hash.
//
//   add --caller-id <id> [--credential-holder-type USER|ROLE|SERVICE|ORGANIZATION]
//       [--allowed-capabilities <a,b>] [--allowed-principal-ids <a,b>]
//       [--step-up-public-key-stdin]
//       Makes a new API key, stores only its SHA-256 hash, and prints the key
//       once. It cannot be shown again. Adding a caller ID that already
//       exists adds a second key for it, which is how a key is rotated.
//
//   remove --caller-id <id> [--keep-newest]
//       Removes every key of that caller ID. With --keep-newest it keeps the
//       one added last, which ends a rotation: add a new key, let the holder
//       switch, then remove the old ones.
//
// The API reads api-keys.json only when it starts, so every change needs
// `docker compose restart api` to take effect. The file is checked with the
// same parser the API uses before it is written, so a change the API would
// refuse to start with is never saved.

import { createHash, createPublicKey, randomBytes } from "node:crypto";
import { chownSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseApiKeys } from "@parmana/shared";

const root = process.env.PARMANA_LOCAL_DIR ?? "/app/parmana-local";
const apiKeysPath = path.join(root, "api-keys.json");
const HOLDER_TYPES = ["USER", "ROLE", "SERVICE", "ORGANIZATION"];

function fail(message) {
  console.error(`[api-keys] ${message}`);
  process.exit(1);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`${name} needs a value.`);
  }
  return value;
}

function list(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function readEntries() {
  if (!existsSync(apiKeysPath)) {
    fail(`${apiKeysPath} does not exist. Start the deployment once first.`);
  }
  return JSON.parse(readFileSync(apiKeysPath, "utf8"));
}

function writeEntries(entries) {
  const serialized = JSON.stringify(entries, null, 2) + "\n";
  // Throws with the API's own message if the API would refuse this file.
  parseApiKeys(serialized);
  writeFileSync(apiKeysPath, serialized, { mode: 0o644 });
  // Keep the file readable by the image's `node` user (uid 1000), which the
  // API runs as.
  if (process.getuid?.() === 0) chownSync(apiKeysPath, 1000, 1000);
}

const [command, ...args] = process.argv.slice(2);

if (command === "list") {
  const entries = readEntries();
  for (const entry of entries) {
    console.log(
      [
        `callerId=${entry.callerId}`,
        `credentialHolderType=${entry.credentialHolderType ?? "(none)"}`,
        `allowedCapabilities=${(entry.allowedCapabilities ?? []).join(",") || "(none)"}`,
        `allowedPrincipalIds=${(entry.allowedPrincipalIds ?? []).join(",") || `(own caller ID only)`}`,
        `stepUpKey=${entry.stepUpPublicKey ? "yes" : "no"}`,
      ].join("  "),
    );
  }
  console.log(`[api-keys] ${entries.length} key(s)`);
} else if (command === "add") {
  const callerId = option(args, "--caller-id");
  if (!callerId) fail("--caller-id is required.");

  const holderType = option(args, "--credential-holder-type");
  if (holderType !== undefined && !HOLDER_TYPES.includes(holderType)) {
    fail(`--credential-holder-type must be one of ${HOLDER_TYPES.join(", ")}.`);
  }

  const capabilities = option(args, "--allowed-capabilities");
  const principals = option(args, "--allowed-principal-ids");
  const stepUpFromStdin = args.includes("--step-up-public-key-stdin");

  let stepUpPublicKey;
  if (stepUpFromStdin) {
    // The approver's public key comes in on standard input, so nothing has
    // to be copied into parmana-local, whose files belong to uid 1000.
    stepUpPublicKey = readFileSync(0, "utf8");
    try {
      if (createPublicKey(stepUpPublicKey).asymmetricKeyType !== "ed25519") {
        fail("the step up public key must be an Ed25519 public key.");
      }
    } catch {
      fail(
        "no PEM public key on standard input. Pipe the approver's public key " +
          "in, and run `docker compose run` with -T.",
      );
    }
    if (holderType !== "USER") {
      fail(
        "a step up key is only used by a verified human; add --credential-holder-type USER.",
      );
    }
  }

  const rawKey = `pk_local_${randomBytes(32).toString("base64url")}`;
  const entry = {
    callerId,
    keyHash: createHash("sha256").update(rawKey).digest("hex"),
    ...(capabilities !== undefined
      ? { allowedCapabilities: list(capabilities) }
      : {}),
    ...(principals !== undefined
      ? { allowedPrincipalIds: list(principals) }
      : {}),
    ...(holderType !== undefined ? { credentialHolderType: holderType } : {}),
    ...(stepUpPublicKey !== undefined ? { stepUpPublicKey } : {}),
  };

  const entries = readEntries();
  entries.push(entry);
  writeEntries(entries);

  console.log(
    `[api-keys] added a key for caller "${callerId}". It is shown once:`,
  );
  console.log(rawKey);
  console.log(
    "[api-keys] run `docker compose restart api` for it to take effect.",
  );
} else if (command === "remove") {
  const callerId = option(args, "--caller-id");
  if (!callerId) fail("--caller-id is required.");

  const keepNewest = args.includes("--keep-newest");
  const entries = readEntries();
  const newestIndex = entries
    .map((entry) => entry.callerId)
    .lastIndexOf(callerId);
  if (newestIndex === -1) fail(`no key has caller ID "${callerId}".`);
  const kept = entries.filter(
    (entry, index) =>
      entry.callerId !== callerId || (keepNewest && index === newestIndex),
  );
  if (kept.length === entries.length) {
    fail(
      `caller "${callerId}" has only one key; --keep-newest has nothing to remove.`,
    );
  }
  if (kept.length === 0)
    fail("refusing to remove the last key: the API cannot start without one.");
  writeEntries(kept);

  console.log(
    `[api-keys] removed ${entries.length - kept.length} key(s) of caller "${callerId}". ` +
      "Run `docker compose restart api` for it to take effect.",
  );
} else {
  fail(
    "usage: api-keys.mjs list | add --caller-id <id> [...] | remove --caller-id <id> [--keep-newest]",
  );
}

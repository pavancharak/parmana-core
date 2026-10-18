import { generateKeyPairSync } from "node:crypto";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";

import { join, resolve } from "node:path";

import { loadConfig } from "@parmana/shared";

/**
 * Maps a Parmana signature algorithm name (as configured
 * via SIGNATURE_PROVIDER) to the native node:crypto key
 * type used to generate it.
 */
const NODE_KEY_TYPES = {
  ed25519: "ed25519",
  dilithium3: "ml-dsa-65",
} as const;

type SupportedAlgorithm = keyof typeof NODE_KEY_TYPES;

/**
 * "ml-dsa-65" (the NIST/FIPS 204 standard name) is accepted as an
 * input alias for "dilithium3" (this codebase's internal identifier,
 * unchanged for backward compatibility with existing
 * SIGNATURE_PROVIDER=dilithium3 deployments) -- see
 * ConfigValidation.ts's parseSignatureAlgorithm for the same alias on
 * the config-parsing side.
 */
const ALGORITHM_ALIASES: Record<string, SupportedAlgorithm> = {
  "ml-dsa-65": "dilithium3",
};

function isSupportedAlgorithm(value: string): value is SupportedAlgorithm {
  return value in NODE_KEY_TYPES;
}

function parseArgs(argv: string[]): {
  algorithm: string;
  force: boolean;
} {
  let algorithm = "ed25519";
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--force") {
      force = true;
    } else if (arg === "--algorithm") {
      algorithm = argv[++i] ?? algorithm;
    } else if (arg?.startsWith("--algorithm=")) {
      algorithm = arg.slice("--algorithm=".length);
    }
  }

  return { algorithm, force };
}

const { algorithm: rawAlgorithm, force } = parseArgs(process.argv.slice(2));

const algorithm = ALGORITHM_ALIASES[rawAlgorithm] ?? rawAlgorithm;

if (!isSupportedAlgorithm(algorithm)) {
  throw new Error(
    `Unknown --algorithm "${rawAlgorithm}". Supported: ` +
      `${[...Object.keys(NODE_KEY_TYPES), ...Object.keys(ALGORITHM_ALIASES)].join(", ")}`,
  );
}

//
// Resolve the key directory the exact same way FileKeyProvider
// does, so keys generated here are the ones the runtime actually
// reads (relative to the invoking process's cwd, unless
// PARMANA_KEY_DIR overrides it).
//
const config = loadConfig();

const keyDirectory = resolve(config.keys.keyDirectory ?? "./keys");

const privatePath = join(keyDirectory, "default.private.pem");
const publicPath = join(keyDirectory, "default.public.pem");

if (!force && (existsSync(privatePath) || existsSync(publicPath))) {
  throw new Error(
    `Key material already exists at "${keyDirectory}" ` +
      "(default.private.pem / default.public.pem). Refusing to " +
      "overwrite existing keys — pass --force to regenerate.",
  );
}

mkdirSync(keyDirectory, { recursive: true });

const nodeKeyType = NODE_KEY_TYPES[algorithm];

const { privateKey, publicKey } = generateKeyPairSync(nodeKeyType);

writeFileSync(
  privatePath,
  privateKey.export({
    format: "pem",
    type: "pkcs8",
  }),
);

writeFileSync(
  publicPath,
  publicKey.export({
    format: "pem",
    type: "spki",
  }),
);

console.log(
  `${algorithm} keypair generated at ${keyDirectory} ` +
    "(default.private.pem / default.public.pem).",
);

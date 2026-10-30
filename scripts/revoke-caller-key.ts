import "dotenv/config";

import {
  PostgresPoolFactory,
  SupabaseCallerKeyRevocationRepository,
} from "@parmana/storage";

/**
 * Revokes one caller API key. The key is refused on the next request,
 * with no restart. Requires DATABASE_URL, and applies the
 * 20261030120000_add_caller_key_revocations.sql migration first.
 *
 * Pass the key's SHA-256 hash, not the key, so the key never has to be
 * typed or pasted. Compute the hash without a trailing newline:
 *
 *   printf '%s' "$KEY" | sha256sum
 *
 * Usage:
 *   npx tsx scripts/revoke-caller-key.ts \
 *     --key-hash <64 hex characters> \
 *     --caller-id <callerId the key belongs to> \
 *     --by <operator name> \
 *     --reason "<why it is revoked>"
 *
 * Revoking a key already revoked does nothing, so a repeat is safe.
 */

const KEY_HASH = /^[0-9a-f]{64}$/;

export interface RevokeArguments {
  readonly keyHash: string;
  readonly callerId: string;
  readonly revokedBy: string;
  readonly reason: string;
}

function argument(args: string[], name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing argument: ${name}`);
  }

  const value = args[index + 1];

  if (value.trim().length === 0) {
    throw new Error(`${name} must not be empty.`);
  }

  return value;
}

export function parseRevokeArguments(args: string[]): RevokeArguments {
  const keyHash = argument(args, "--key-hash");

  if (!KEY_HASH.test(keyHash)) {
    throw new Error(
      "--key-hash must be 64 lowercase hex characters (a SHA-256 digest).",
    );
  }

  return {
    keyHash,
    callerId: argument(args, "--caller-id"),
    revokedBy: argument(args, "--by"),
    reason: argument(args, "--reason"),
  };
}

async function main(args = process.argv.slice(2)): Promise<void> {
  const parsed = parseRevokeArguments(args);

  const pool = PostgresPoolFactory.create();

  try {
    const repository = new SupabaseCallerKeyRevocationRepository(pool);

    await repository.revoke({
      keyHash: parsed.keyHash,
      callerId: parsed.callerId,
      revokedBy: parsed.revokedBy,
      reason: parsed.reason,
      revokedAt: new Date(),
    });

    console.log(
      `Revoked key ${parsed.keyHash.slice(0, 12)}... for caller ${parsed.callerId}. ` +
        "It is refused from the next request.",
    );
  } finally {
    await pool.end();
  }
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main };

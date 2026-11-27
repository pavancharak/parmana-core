/**
 * Measures what the hybrid signature envelope costs: record size, signing
 * time and offline verification time, for three modes:
 *
 *   single  legacy signature only (CRYPTO_MODE=single)
 *   v2      schema 2 hybrid (CRYPTO_MODE=hybrid, the default schema)
 *   v3      schema 3 hybrid (HYBRID_SCHEMA_VERSION=3, acknowledged)
 *
 * Usage (from the repository root, after `npm run build:packages`):
 *   npx tsx scripts/bench-whole-record-cost.ts [iterations]
 *
 * Each mode runs in its own child process, because the server reads its
 * configuration once, when the signing modules load. Keys are generated
 * fresh in a temporary directory and deleted afterwards. They are not
 * production keys and are never written to PARMANA_KEY_DIR.
 *
 * The record is minimal (one transaction, no executions), so byte counts
 * are the cost of the signature envelope. Measure real records on the
 * deployment's own hardware before sizing storage or latency budgets.
 */
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const MODES = ["single", "v2", "v3"] as const;
type Mode = (typeof MODES)[number];

function measure(mode: Mode, keyDir: string, iterations: number): void {
  // Configuration first, then the signing code, which reads it on load.
  process.env.PARMANA_KEY_DIR = keyDir;
  process.env.PARMANA_POLICY_DIR = keyDir;
  process.env.PARMANA_VERIFICATION_KEY_ID = "bench-ed";
  process.env.PARMANA_VERIFICATION_SECONDARY_KEY_ID = "bench-ml";
  process.env.PRIMARY_SIGNATURE_PROVIDER = "ed25519";

  if (mode === "single") {
    process.env.CRYPTO_MODE = "single";
  } else {
    process.env.CRYPTO_MODE = "hybrid";
    process.env.SECONDARY_SIGNATURE_PROVIDER = "ml-dsa-65";
  }
  if (mode === "v3") {
    process.env.HYBRID_SCHEMA_VERSION = "3";
    process.env.HYBRID_SCHEMA_V3_ACKNOWLEDGED = "true";
  }

  const main = async (): Promise<void> => {
    const { VerificationCrypto } = await import(
      pathToFileURL(path.join(repo, "packages/crypto/dist/index.js")).href
    );
    const sdk = await import(
      pathToFileURL(path.join(repo, "typescript/dist/index.js")).href
    );
    const crypto = new VerificationCrypto();

    const at = "2026-03-01T00:00:00.000Z";
    const schemaVersion = mode === "v3" ? 3 : 2;
    const draft = {
      trustRecordId: "bench",
      businessTransactionId: "bench",
      transaction: {
        businessTransactionId: "bench",
        status: "RECEIVED",
        createdAt: new Date(at),
        signals: { amount: 100 },
      },
      executions: [],
      createdAt: new Date(at),
      updatedAt: new Date(at),
      schemaVersion,
    };

    const build = async () => {
      const trustRecordHash = await crypto.hash(draft);
      const signature = await crypto.sign(draft);
      const signatures =
        mode === "single"
          ? undefined
          : await crypto.signHybrid({ ...draft, trustRecordHash, signature });
      return {
        ...draft,
        trustRecordHash,
        signature,
        ...(signatures ? { signatures } : {}),
      };
    };

    let record: unknown;
    const signStart = performance.now();
    for (let i = 0; i < iterations; i++) record = await build();
    const signMs = (performance.now() - signStart) / iterations;

    // Records are stored and read as JSON, so verify the round-tripped form.
    record = JSON.parse(JSON.stringify(record));
    const bytes = Buffer.byteLength(JSON.stringify(record));

    const publicKeys: Record<string, string> = {
      "bench-ed": readFileSync(
        path.join(keyDir, "bench-ed.public.pem"),
        "utf8",
      ),
    };
    if (mode !== "single") {
      publicKeys["bench-ml"] = readFileSync(
        path.join(keyDir, "bench-ml.public.pem"),
        "utf8",
      );
    }

    let result: { valid: boolean; coverage: string } | undefined;
    const verifyStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      result = sdk.verifyExecutionTrustRecordOffline(record, publicKeys);
    }
    const verifyMs = (performance.now() - verifyStart) / iterations;

    if (!result || !result.valid) {
      throw new Error(`mode ${mode}: the benchmark record did not verify`);
    }

    console.log(
      JSON.stringify({
        mode,
        schemaVersion,
        bytes,
        signMs: Number(signMs.toFixed(3)),
        verifyMs: Number(verifyMs.toFixed(3)),
        coverage: result.coverage,
        iterations,
      }),
    );
  };

  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}

const childMode = process.env.BENCH_CHILD_MODE as Mode | undefined;
if (childMode !== undefined) {
  measure(
    childMode,
    process.env.BENCH_KEY_DIR!,
    Number(process.env.BENCH_ITERATIONS ?? 1000),
  );
} else {
  const iterations = Number(process.argv[2] ?? 1000);
  const keyDir = mkdtempSync(path.join(tmpdir(), "parmana-bench-keys-"));
  try {
    for (const id of ["bench-ed", "bench-ml"]) {
      const pair = generateKeyPairSync(
        id === "bench-ed" ? "ed25519" : "ml-dsa-65",
      );
      writeFileSync(
        path.join(keyDir, `${id}.private.pem`),
        pair.privateKey.export({ format: "pem", type: "pkcs8" }),
      );
      writeFileSync(
        path.join(keyDir, `${id}.public.pem`),
        pair.publicKey.export({ format: "pem", type: "spki" }),
      );
    }

    for (const mode of MODES) {
      const child = spawnSync(
        process.execPath,
        ["--import", "tsx", fileURLToPath(import.meta.url)],
        {
          cwd: repo,
          env: {
            ...process.env,
            BENCH_CHILD_MODE: mode,
            BENCH_KEY_DIR: keyDir,
            BENCH_ITERATIONS: String(iterations),
          },
          encoding: "utf8",
        },
      );
      if (child.status !== 0) {
        console.error(child.stderr);
        throw new Error(`mode ${mode} failed with exit ${child.status}`);
      }
      process.stdout.write(child.stdout);
    }

    console.log(
      `node ${process.version}, ${iterations} iterations per mode. Not production keys.`,
    );
  } finally {
    rmSync(keyDir, { recursive: true, force: true });
  }
}

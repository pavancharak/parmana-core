/**
 * Frozen cryptographic core (decision D8; list in docs/assurance/COVERAGE_REGISTER.md, section 3).
 *
 * Each frozen file's SHA-256 is recorded in docs/assurance/frozen-core.manifest.json.
 * A change to a frozen file fails this test until the manifest is regenerated, and
 * the regenerated manifest is then a visible part of the diff for owner review.
 *
 * Regenerate (after owner review only):
 *   ASSURANCE_WRITE_FROZEN_MANIFEST=1 node_modules/vitest/vitest.mjs run tests/assurance/frozen-core.test.ts
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifestPath = join(
  repoRoot,
  "docs",
  "assurance",
  "frozen-core.manifest.json",
);

/** Individual frozen files. */
const FROZEN_FILES = [
  "packages/crypto/src/ArtifactSigner.ts",
  "packages/crypto/src/TrustRecordHasher.ts",
  "packages/crypto/src/CanonicalSerializer.ts",
  "packages/crypto/src/ExecutionTrustRecordCanonicalView.ts",
  "packages/crypto/src/OfflineVerifier.ts",
];

/** Directories whose every .ts file is frozen. */
const FROZEN_DIRECTORIES = [
  "packages/crypto/src/providers/signature",
  "packages/crypto/src/providers/hash",
];

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];

  for (const name of readdirSync(dir)) {
    const full = join(dir, name);

    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full));
    } else if (name.endsWith(".ts")) {
      out.push(full);
    }
  }

  return out;
}

function frozenPaths(): string[] {
  const paths = new Set<string>(FROZEN_FILES);

  for (const dir of FROZEN_DIRECTORIES) {
    for (const file of tsFilesUnder(join(repoRoot, dir))) {
      paths.add(relative(repoRoot, file).split(sep).join("/"));
    }
  }

  return [...paths].sort();
}

function currentManifest(): Record<string, string> {
  const manifest: Record<string, string> = {};

  for (const path of frozenPaths()) {
    manifest[path] = sha256(join(repoRoot, path));
  }

  return manifest;
}

describe("frozen cryptographic core (D8)", () => {
  if (process.env.ASSURANCE_WRITE_FROZEN_MANIFEST === "1") {
    it("writes the manifest (owner review required before committing it)", () => {
      writeFileSync(
        manifestPath,
        JSON.stringify(currentManifest(), null, 2) + "\n",
      );
      expect(existsSync(manifestPath)).toBe(true);
    });

    return;
  }

  it("has a manifest", () => {
    expect(existsSync(manifestPath)).toBe(true);
  });

  it("every frozen file matches its recorded hash", () => {
    const recorded = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      string
    >;
    const changed: string[] = [];

    for (const [path, hash] of Object.entries(recorded)) {
      const full = join(repoRoot, path);

      if (!existsSync(full) || sha256(full) !== hash) {
        changed.push(path);
      }
    }

    expect(
      changed,
      "frozen files changed or missing; regenerate only after owner review",
    ).toEqual([]);
  });

  it("lists every file in the frozen set, and nothing else", () => {
    const recorded = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      string
    >;

    expect(Object.keys(recorded).sort()).toEqual(frozenPaths());
  });

  it("the frozen set includes every named file", () => {
    for (const file of FROZEN_FILES) {
      expect(existsSync(join(repoRoot, file)), file).toBe(true);
    }
  });
});

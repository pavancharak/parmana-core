import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FilePolicyRepository } from "../../src/FilePolicyRepository.js";
import { PolicyNotFoundError } from "../../src/errors/PolicyNotFoundError.js";
import { PolicyWriteRejectedError } from "../../src/errors/PolicyWriteRejectedError.js";
import { PolicyVersionImmutableError } from "../../src/errors/PolicyVersionImmutableError.js";
import type { Policy } from "../../src/types/Policy.js";

/**
 * Found by adversarial testing: name/version had no input validation
 * before path.join(basePath, name, version, "policy.json"), letting a
 * caller traverse outside the configured policy directory and read
 * (and attempt to evaluate) any file literally named policy.json
 * elsewhere on disk. Same bug class @parmana/crypto's FileKeyProvider
 * was already hardened against (see its own file-key-provider.test.ts)
 * — this mirrors that fix and that test file's structure.
 */
describe("FilePolicyRepository name/version sanitization", () => {
  const basePath = path.resolve(import.meta.dirname, "../../../../policies");

  it("rejects a path-traversal name that resolves outside basePath", async () => {
    const repository = new FilePolicyRepository(basePath);

    await expect(
      repository.load("../examples/tutorials/01-hello-world", "."),
    ).rejects.toThrow(PolicyNotFoundError);
  });

  it("rejects a path-traversal version", async () => {
    const repository = new FilePolicyRepository(basePath);

    await expect(
      repository.load("vendor-payment", "../../../../../../etc"),
    ).rejects.toThrow(PolicyNotFoundError);
  });

  it("never reads a file outside basePath even when the traversal target exists and is valid JSON", async () => {
    const repository = new FilePolicyRepository(basePath);

    // examples/tutorials/01-hello-world/policy.json is real, valid JSON,
    // and sits one level outside basePath — proof this is rejected by
    // name/version shape, not merely because the target happens not to
    // exist (the exact differential the live exploit relied on: a
    // content-dependent error would prove the file was read).
    const error = await repository
      .load("../examples/tutorials/01-hello-world", ".")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PolicyNotFoundError);
  });

  // Found by mutation testing: the character check's anchors and the "."
  // check could be weakened without a test failing, because every
  // traversal test also leaves basePath and is caught by the second,
  // resolved-path check. These names stay inside basePath, so only the
  // character check refuses them.
  it.each([
    ["a name with a slash", "nested/name", "1.0.0"],
    ["a version with a slash", "nested", "name/1.0.0"],
    ["a name that is only a dot", ".", "1.0.0"],
  ])(
    "rejects %s even when it stays inside basePath",
    async (_label, name, version) => {
      const base = mkdtempSync(path.join(tmpdir(), "policy-inside-"));
      try {
        const policyJson = JSON.stringify({ policyId: "inside", rules: [] });
        for (const dir of ["nested/name/1.0.0", "1.0.0"]) {
          mkdirSync(path.join(base, dir), { recursive: true });
          writeFileSync(path.join(base, dir, "policy.json"), policyJson);
        }
        const repository = new FilePolicyRepository(base);
        await expect(repository.load(name, version)).rejects.toThrow(
          PolicyNotFoundError,
        );
      } finally {
        rmSync(base, { recursive: true, force: true });
      }
    },
  );

  it("accepts the well-formed name/version used by the rest of the suite", async () => {
    const repository = new FilePolicyRepository(basePath);

    const policy = await repository.load("vendor-payment", "2.0.0");

    expect(policy.policyId).toBe("vendor-payment");
  });
});

/**
 * Policy Governance's approve flow (PolicyChangeApprovalService)
 * writes the live policies/{name}/{version}/policy.json file. These
 * tests run against a scratch temp directory, never the real
 * packages/policies/ tree the suite above reads from -- a save() test
 * pointed at the real repo would leave junk policy directories behind
 * on every run.
 */
describe("FilePolicyRepository.save", () => {
  let basePath: string;

  afterEach(() => {
    rmSync(basePath, { recursive: true, force: true });
  });

  function samplePolicy(policyId: string, policyVersion: string): Policy {
    return {
      policyId,
      policyVersion,
      schemaVersion: "1.0.0",
      rules: [
        {
          id: "always-approve",
          condition: { always: true },
          outcome: { action: "approve", reason: "test fixture" },
        },
      ],
    } as unknown as Policy;
  }

  it("writes a new version directory that load() then round-trips", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);

    await repository.save(
      "governance-write-target",
      "1.0.0",
      samplePolicy("governance-write-target", "1.0.0"),
    );

    const loaded = await repository.load("governance-write-target", "1.0.0");

    expect(loaded.policyId).toBe("governance-write-target");
    expect(
      existsSync(
        path.join(basePath, "governance-write-target", "1.0.0", "policy.json"),
      ),
    ).toBe(true);
  });

  it("refuses different content at an existing (name, version): published versions are immutable", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);

    await repository.save(
      "governance-overwrite",
      "1.0.0",
      samplePolicy("governance-overwrite", "1.0.0"),
    );

    const updated = {
      ...samplePolicy("governance-overwrite", "1.0.0"),
      description: "updated content",
    } as unknown as Policy;

    await expect(
      repository.save("governance-overwrite", "1.0.0", updated),
    ).rejects.toBeInstanceOf(PolicyVersionImmutableError);

    const loaded = await repository.load("governance-overwrite", "1.0.0");
    expect((loaded as unknown as { description?: string }).description).toBeUndefined();
  });

  it("allows re-saving identical content (an approved rollback), regardless of key order", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);
    const original = samplePolicy("governance-rollback", "1.0.0");

    await repository.save("governance-rollback", "1.0.0", original);

    const reordered = Object.fromEntries(Object.entries(original).reverse()) as unknown as Policy;
    await expect(
      repository.save("governance-rollback", "1.0.0", reordered),
    ).resolves.toBeUndefined();
  });

  it("leaves no stray temp file behind after a successful write", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);

    await repository.save(
      "governance-no-temp-leftover",
      "1.0.0",
      samplePolicy("governance-no-temp-leftover", "1.0.0"),
    );

    const entries = await readdir(
      path.join(basePath, "governance-no-temp-leftover", "1.0.0"),
    );

    expect(entries).toEqual(["policy.json"]);
  });

  it("writes valid, re-parseable JSON", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);

    await repository.save(
      "governance-valid-json",
      "1.0.0",
      samplePolicy("governance-valid-json", "1.0.0"),
    );

    const raw = readFileSync(
      path.join(basePath, "governance-valid-json", "1.0.0", "policy.json"),
      "utf8",
    );

    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("rejects a path-traversal name and never writes outside basePath", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);

    await expect(
      repository.save(
        "../escape-attempt",
        "1.0.0",
        samplePolicy("escape-attempt", "1.0.0"),
      ),
    ).rejects.toThrow(PolicyWriteRejectedError);

    expect(existsSync(path.resolve(basePath, "..", "escape-attempt"))).toBe(
      false,
    );
  });

  it("rejects a path-traversal version and never writes outside basePath", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);

    await expect(
      repository.save(
        "governance-write-target",
        "../../escape-attempt",
        samplePolicy("governance-write-target", "1.0.0"),
      ),
    ).rejects.toThrow(PolicyWriteRejectedError);
  });

  it("creates the version directory when it does not already exist", async () => {
    basePath = mkdtempSync(path.join(tmpdir(), "parmana-policy-save-"));
    const repository = new FilePolicyRepository(basePath);

    expect(existsSync(path.join(basePath, "brand-new-policy"))).toBe(false);

    await repository.save(
      "brand-new-policy",
      "1.0.0",
      samplePolicy("brand-new-policy", "1.0.0"),
    );

    expect(
      existsSync(
        path.join(basePath, "brand-new-policy", "1.0.0", "policy.json"),
      ),
    ).toBe(true);
  });
});

/**
 * Found by CodeQL (js/path-injection): the name/version pattern allowed
 * a bare "." or "..", which path.join() treats as a directory step, so
 * name ".." reached the directory above basePath, for both reading and
 * writing a sibling directory's policy.json.
 */
describe("FilePolicyRepository dot-only name/version", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function layout() {
    const root = mkdtempSync(path.join(tmpdir(), "policy-dots-"));
    roots.push(root);
    const basePath = path.join(root, "policies");
    const sibling = path.join(root, "sibling");
    return { basePath, sibling };
  }

  for (const [name, version] of [
    ["..", "sibling"],
    [".", "x"],
    ["refund", ".."],
  ] as const) {
    it(`load rejects name ${JSON.stringify(name)}, version ${JSON.stringify(version)}`, async () => {
      const { basePath } = layout();

      await expect(
        new FilePolicyRepository(basePath).load(name, version),
      ).rejects.toThrow(PolicyNotFoundError);
    });

    it(`save rejects name ${JSON.stringify(name)}, version ${JSON.stringify(version)} and writes nothing outside basePath`, async () => {
      const { basePath, sibling } = layout();

      await expect(
        new FilePolicyRepository(basePath).save(name, version, {} as Policy),
      ).rejects.toThrow(PolicyWriteRejectedError);
      expect(existsSync(path.join(sibling, "policy.json"))).toBe(false);
    });
  }
});

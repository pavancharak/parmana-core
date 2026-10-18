import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilePolicyRepository } from "../../src/FilePolicyRepository.js";
import { PolicyRegistry } from "../../src/PolicyRegistry.js";
import { PolicyRouter } from "../../src/PolicyRouter.js";
import { SupabasePolicyRepository } from "../../src/SupabasePolicyRepository.js";
import {
  PolicyError,
  PolicyNotFoundError,
  PolicyValidationError,
  PolicyWriteRejectedError,
  SignalValidationError,
} from "../../src/errors/index.js";
import type { Policy } from "../../src/types/Policy.js";

/**
 * Mutation testing found the production policy store
 * (SupabasePolicyRepository) with no test in this package, the file
 * store's listing untested, the router's conflict warnings unchecked,
 * and the error classes' names and messages free to change. Each is
 * pinned here.
 */

const POLICY = {
  policyId: "p",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  rules: [
    {
      id: "reject",
      condition: { always: true },
      outcome: { action: "reject", reason: "Rejected." },
    },
  ],
} as unknown as Policy;

function fakePool(rows: unknown[] = []) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows }));
  return { pool: { query } as unknown as Pool, query };
}

describe("SupabasePolicyRepository", () => {
  it("loads the stored content for exactly that name and version", async () => {
    const { pool, query } = fakePool([{ content_json: POLICY }]);
    await expect(
      new SupabasePolicyRepository(pool).load("customer-refund", "1.2.0"),
    ).resolves.toBe(POLICY);
    expect(query.mock.calls[0]![0]).toMatch(
      /SELECT content_json FROM policies WHERE policy_name = \$1 AND policy_version = \$2/,
    );
    expect(query.mock.calls[0]![1]).toEqual(["customer-refund", "1.2.0"]);
  });

  it("reports a policy that is not stored as not found", async () => {
    const { pool } = fakePool([]);
    await expect(
      new SupabasePolicyRepository(pool).load("p", "1.0.0"),
    ).rejects.toThrow("Policy 'p' version '1.0.0' was not found.");
  });

  it.each([
    ["../p", "1.0.0"],
    ["p", "1.0.0/../x"],
    ["p q", "1"],
    ["p", ""],
    ["", "1"],
    ["p;drop", "1"],
  ])(
    "refuses the name %j and version %j without querying, for load and save",
    async (name, version) => {
      const { pool, query } = fakePool([{ content_json: POLICY }]);
      const repository = new SupabasePolicyRepository(pool);
      await expect(repository.load(name, version)).rejects.toBeInstanceOf(
        PolicyNotFoundError,
      );
      await expect(
        repository.save(name, version, POLICY),
      ).rejects.toBeInstanceOf(PolicyWriteRejectedError);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it("saves the content as JSON under that name and version, as an upsert", async () => {
    const { pool, query } = fakePool();
    await new SupabasePolicyRepository(pool).save("p", "1.0.0", POLICY);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO policies/);
    expect(sql).toMatch(/ON CONFLICT \(policy_name, policy_version\)/);
    expect(params).toEqual(["p", "1.0.0", JSON.stringify(POLICY)]);
  });

  it("lists every stored name and version", async () => {
    const { pool } = fakePool([
      { policy_name: "a", policy_version: "1" },
      { policy_name: "b", policy_version: "2" },
    ]);
    await expect(new SupabasePolicyRepository(pool).listAll()).resolves.toEqual(
      [
        { name: "a", version: "1" },
        { name: "b", version: "2" },
      ],
    );
  });
});

describe("FilePolicyRepository listing and reading", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("lists only version directories holding a policy.json", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "policies-"));
    mkdirSync(path.join(dir, "a", "1.0.0"), { recursive: true });
    writeFileSync(path.join(dir, "a", "1.0.0", "policy.json"), "{}");
    mkdirSync(path.join(dir, "a", "2.0.0"), { recursive: true });
    writeFileSync(path.join(dir, "a", "notes.txt"), "x");
    writeFileSync(path.join(dir, "README.md"), "x");

    await expect(new FilePolicyRepository(dir).listAll()).resolves.toEqual([
      { name: "a", version: "1.0.0" },
    ]);
  });

  it("lists nothing when the directory does not exist", async () => {
    await expect(
      new FilePolicyRepository(
        path.join(tmpdir(), "parmana-no-such-directory"),
      ).listAll(),
    ).resolves.toEqual([]);
  });

  it("reports a policy.json that is not JSON as not found", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "policies-"));
    mkdirSync(path.join(dir, "a", "1.0.0"), { recursive: true });
    writeFileSync(path.join(dir, "a", "1.0.0", "policy.json"), "{not json");

    await expect(
      new FilePolicyRepository(dir).load("a", "1.0.0"),
    ).rejects.toThrow("Policy 'a' version '1.0.0' was not found.");
  });

  it("refuses .. as a name or version", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "policies-"));
    const repository = new FilePolicyRepository(path.join(dir, "inner"));
    await expect(repository.load("..", "x")).rejects.toBeInstanceOf(
      PolicyNotFoundError,
    );
    await expect(repository.save("a", "..", POLICY)).rejects.toBeInstanceOf(
      PolicyWriteRejectedError,
    );
  });
});

describe("PolicyRouter", () => {
  it("validates the loaded policy and logs each rule conflict", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const policy = {
      ...POLICY,
      unboundSignalReasons: { x: "Checked." },
      rules: [
        {
          id: "a",
          condition: { fact: "x", operator: "eq", value: 1 },
          outcome: { action: "reject", reason: "r" },
        },
        {
          id: "b",
          condition: { fact: "x", operator: "eq", value: 1 },
          outcome: { action: "reject", reason: "r" },
        },
        ...POLICY.rules,
      ],
    } as unknown as Policy;

    try {
      const loaded = await new PolicyRouter({
        load: async () => policy,
        save: async () => undefined,
      }).load("p", "1.0.0");

      expect(loaded).toBe(policy);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toMatchObject({
        event: "policy_rule_conflict_detected",
        policyId: "p",
        policyVersion: "1.0.0",
        level: "WARNING",
        ruleId: "a",
        conflictingRuleId: "b",
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses an invalid policy", async () => {
    await expect(
      new PolicyRouter({
        load: async () => ({ ...POLICY, rules: [] }) as unknown as Policy,
        save: async () => undefined,
      }).load("p", "1.0.0"),
    ).rejects.toThrow("Policy must contain at least one rule.");
  });
});

describe("PolicyRegistry", () => {
  it("registers, finds, lists, removes and clears by name and version", () => {
    const registry = new PolicyRegistry();
    const a = { name: "a", version: "1", path: "/a/1" };
    const b = { name: "a", version: "2", path: "/a/2" };
    registry.register(a);
    registry.register(b);

    expect(registry.find("a", "1")).toBe(a);
    expect(registry.find("a", "3")).toBeUndefined();
    expect(registry.has("a", "2")).toBe(true);
    expect(registry.has("b", "1")).toBe(false);
    expect(registry.list()).toEqual([a, b]);
    expect(registry.size()).toBe(2);
    expect(registry.unregister("a", "1")).toBe(true);
    expect(registry.unregister("a", "1")).toBe(false);
    expect(registry.size()).toBe(1);
    registry.clear();
    expect(registry.size()).toBe(0);
  });
});

describe("policy errors", () => {
  it.each([
    [new PolicyError("m"), "PolicyError", "m"],
    [new PolicyValidationError("m"), "PolicyValidationError", "m"],
    [new SignalValidationError("m"), "SignalValidationError", "m"],
    [
      new PolicyNotFoundError("p", "1"),
      "PolicyNotFoundError",
      "Policy 'p' version '1' was not found.",
    ],
    [
      new PolicyWriteRejectedError("p", "1"),
      "PolicyWriteRejectedError",
      "Refusing to write policy 'p' version '1': name and version must match ^[A-Za-z0-9._-]+$.",
    ],
  ])("%s has its name and message", (error, name, message) => {
    expect(error).toBeInstanceOf(PolicyError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(name);
    expect(error.message).toBe(message);
  });
});

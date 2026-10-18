import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { findAllPolicyFiles } from "../verify-policy-changes-approved.js";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "policy-scan-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("findAllPolicyFiles", () => {
  it("lists every policy.json under name/version directories", async () => {
    const root = await tempDir();
    await mkdir(path.join(root, "refund", "1.0.0"), { recursive: true });
    await writeFile(path.join(root, "refund", "1.0.0", "policy.json"), "{}");

    const files = await findAllPolicyFiles(root);

    expect(files).toEqual([path.join(root, "refund", "1.0.0", "policy.json")]);
  });

  it("rejects when the policies directory does not exist", async () => {
    const root = await tempDir();

    await expect(
      findAllPolicyFiles(path.join(root, "missing")),
    ).rejects.toThrow();
  });
});

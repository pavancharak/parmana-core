import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sourceFingerprint } from "../source-fingerprint.js";

describe("sourceFingerprint", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "source-fingerprint-"));
    mkdirSync(path.join(dir, "nested"));
    writeFileSync(path.join(dir, "a.ts"), "export const a = 1;\n");
    writeFileSync(path.join(dir, "nested", "b.ts"), "export const b = 2;\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined when there is no source directory", () => {
    expect(sourceFingerprint(path.join(dir, "missing"))).toBeUndefined();
  });

  it("is stable for the same content", () => {
    expect(sourceFingerprint(dir)).toBe(sourceFingerprint(dir));
  });

  it("does not change when only timestamps change", () => {
    const before = sourceFingerprint(dir);
    const old = new Date("2001-01-01T00:00:00Z");
    utimesSync(path.join(dir, "a.ts"), old, old);
    utimesSync(path.join(dir, "nested", "b.ts"), old, old);
    expect(sourceFingerprint(dir)).toBe(before);
  });

  it("changes when a file's content changes", () => {
    const before = sourceFingerprint(dir);
    writeFileSync(path.join(dir, "a.ts"), "export const a = 99;\n");
    expect(sourceFingerprint(dir)).not.toBe(before);
  });

  it("changes when a file is added or renamed", () => {
    const before = sourceFingerprint(dir);
    writeFileSync(path.join(dir, "c.ts"), "export const c = 3;\n");
    const added = sourceFingerprint(dir);
    expect(added).not.toBe(before);
    rmSync(path.join(dir, "c.ts"));
    writeFileSync(path.join(dir, "renamed.ts"), "export const a = 1;\n");
    rmSync(path.join(dir, "a.ts"));
    expect(sourceFingerprint(dir)).not.toBe(before);
  });

  it("ignores files that are not TypeScript source", () => {
    const before = sourceFingerprint(dir);
    writeFileSync(path.join(dir, "notes.md"), "unrelated\n");
    expect(sourceFingerprint(dir)).toBe(before);
  });
});

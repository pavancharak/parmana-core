import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileKeyExpiryStore } from "../../src/index.js";

/**
 * PARMANA_KEY_DIR is set to a fresh temp directory by the global
 * vitest.setup.ts before this file runs -- the same directory
 * FileKeyProvider reads its PEM files from. key-expiry.json is a
 * sidecar file in that same directory.
 */
const keyDirectory = process.env.PARMANA_KEY_DIR!;
const keyExpiryPath = join(keyDirectory, "key-expiry.json");

afterEach(() => {
  rmSync(keyExpiryPath, { force: true });
});

describe("FileKeyExpiryStore", () => {
  it("returns undefined when key-expiry.json does not exist", async () => {
    const store = new FileKeyExpiryStore();

    await expect(store.get("any-key")).resolves.toBeUndefined();
  });

  it("returns undefined for a keyId absent from an existing key-expiry.json", async () => {
    writeFileSync(
      keyExpiryPath,
      JSON.stringify({ "other-key": { revoked: true } }),
    );

    const store = new FileKeyExpiryStore();

    await expect(store.get("unlisted-key")).resolves.toBeUndefined();
  });

  it("returns a parsed expiresAt as a real Date", async () => {
    writeFileSync(
      keyExpiryPath,
      JSON.stringify({
        "key-a": { expiresAt: "2020-01-01T00:00:00.000Z" },
      }),
    );

    const store = new FileKeyExpiryStore();

    const entry = await store.get("key-a");

    expect(entry?.expiresAt).toEqual(new Date("2020-01-01T00:00:00.000Z"));
    expect(entry?.revoked).toBeUndefined();
  });

  it("returns revoked: true", async () => {
    writeFileSync(
      keyExpiryPath,
      JSON.stringify({ "key-b": { revoked: true } }),
    );

    const store = new FileKeyExpiryStore();

    const entry = await store.get("key-b");

    expect(entry?.revoked).toBe(true);
    expect(entry?.expiresAt).toBeUndefined();
  });

  it("throws on malformed JSON rather than silently treating the key as unexpiring", async () => {
    writeFileSync(keyExpiryPath, "{not valid json");

    const store = new FileKeyExpiryStore();

    await expect(store.get("key-a")).rejects.toThrow(/not valid JSON/);
  });

  it("throws on an unparseable expiresAt rather than treating the key as never expiring", async () => {
    writeFileSync(
      keyExpiryPath,
      JSON.stringify({ "typo-key": { expiresAt: "2026-13-45" } }),
    );

    const store = new FileKeyExpiryStore();

    await expect(store.get("typo-key")).rejects.toThrow(/ISO 8601/);
  });

  it("throws when the file is not a JSON object", async () => {
    writeFileSync(keyExpiryPath, JSON.stringify(["not", "an", "object"]));

    const store = new FileKeyExpiryStore();

    await expect(store.get("key-a")).rejects.toThrow(/must be a JSON object/);
  });
});

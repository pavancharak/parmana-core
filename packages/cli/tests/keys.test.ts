import { createHash, sign, verify } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Runtime } from "../src/commands.js";
import { main } from "../src/index.js";

/** Runs the CLI against an in-memory file store, recording each key file's mode. */
async function runKeys(argv: string[], files: Record<string, string> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const modes: Record<string, number> = {};
  const runtime: Runtime = {
    env: {},
    homeDir: "/nowhere",
    fetch: (async () => {
      throw new Error("no network in key generation");
    }) as unknown as typeof fetch,
    sleep: async () => undefined,
    log: () => undefined,
    readText: (path) => files[path],
    writeText: (path, text) => {
      files[path] = text;
    },
    fileExists: (path) => files[path] !== undefined,
    ensureDirectory: () => undefined,
    writeKeyFile: (path, text, mode, overwrite) => {
      if (!overwrite && files[path] !== undefined) {
        throw new Error(`EEXIST: ${path}`);
      }
      files[path] = text;
      modes[path] = mode;
    },
    findLogScript: () => undefined,
    runScript: () => 0,
  };
  const code = await main(argv, {
    runtime,
    io: {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
  });
  return { code, files, modes, out: stdout.join(""), err: stderr.join("") };
}

describe("keys generate-api-key", () => {
  it("writes an owner-only raw key and an entry whose hash matches it, and prints no secret", async () => {
    const result = await runKeys([
      "keys",
      "generate-api-key",
      "--caller-id",
      "pavancharak",
      "--out-dir",
      "/keys",
      "--credential-holder-type",
      "USER",
    ]);

    expect(result.code).toBe(0);
    const rawKey = result.files[join("/keys", "pavancharak.key")]?.trim() ?? "";
    expect(rawKey.length).toBeGreaterThan(20);
    expect(result.modes[join("/keys", "pavancharak.key")]).toBe(0o600);

    const entry = JSON.parse(
      result.files[join("/keys", "pavancharak.entry.json")] ?? "",
    );
    expect(entry.callerId).toBe("pavancharak");
    expect(entry.credentialHolderType).toBe("USER");
    expect(entry.keyHash).toBe(
      createHash("sha256").update(rawKey, "utf8").digest("hex"),
    );

    expect(result.out).not.toContain(rawKey);
    expect(result.err).not.toContain(rawKey);
  });

  it("writes a step-up private key only with --generate-step-up-key and USER, and puts its public half in the entry", async () => {
    const result = await runKeys([
      "keys",
      "generate-api-key",
      "--caller-id",
      "mamta-checker",
      "--out-dir",
      "/keys",
      "--credential-holder-type",
      "USER",
      "--generate-step-up-key",
    ]);

    expect(result.code).toBe(0);
    const privatePem =
      result.files[join("/keys", "mamta-checker.step-up.private.pem")];
    expect(privatePem).toContain("BEGIN PRIVATE KEY");
    expect(
      result.modes[join("/keys", "mamta-checker.step-up.private.pem")],
    ).toBe(0o600);

    const entry = JSON.parse(
      result.files[join("/keys", "mamta-checker.entry.json")] ?? "",
    );
    expect(entry.stepUpPublicKey).toContain("BEGIN PUBLIC KEY");
    expect(result.out).not.toContain("PRIVATE KEY");
  });

  it("refuses --generate-step-up-key without USER", async () => {
    const result = await runKeys([
      "keys",
      "generate-api-key",
      "--caller-id",
      "someone",
      "--out-dir",
      "/keys",
      "--generate-step-up-key",
    ]);

    expect(result.code).not.toBe(0);
    expect(result.err).toContain("requires --credential-holder-type USER");
    expect(Object.keys(result.files)).toEqual([]);
  });

  it("refuses to overwrite an existing key file", async () => {
    const result = await runKeys(
      [
        "keys",
        "generate-api-key",
        "--caller-id",
        "pavancharak",
        "--out-dir",
        "/keys",
      ],
      { [join("/keys", "pavancharak.key")]: "old-secret\n" },
    );

    expect(result.code).not.toBe(0);
    expect(result.err).toContain("Refusing to overwrite");
    expect(result.files[join("/keys", "pavancharak.key")]).toBe("old-secret\n");
  });

  it("rejects a caller ID that is unsafe as a file name", async () => {
    const result = await runKeys([
      "keys",
      "generate-api-key",
      "--caller-id",
      "../escape",
      "--out-dir",
      "/keys",
    ]);

    expect(result.code).not.toBe(0);
    expect(result.err).toContain("--caller-id must use only");
  });
});

describe("keys generate-approver-key", () => {
  it("writes a private key (owner-only) and a public key that verifies its signatures", async () => {
    const result = await runKeys([
      "keys",
      "generate-approver-key",
      "--approver-id",
      "mamta-checker",
      "--key-id",
      "mamta-checker-key-1",
      "--out-dir",
      "/approver",
    ]);

    expect(result.code).toBe(0);
    const stem = join("/approver", "mamta-checker__mamta-checker-key-1");
    const privatePem = result.files[`${stem}.private.pem`] ?? "";
    const publicPem = result.files[`${stem}.public.pem`] ?? "";
    expect(privatePem).toContain("BEGIN PRIVATE KEY");
    expect(publicPem).toContain("BEGIN PUBLIC KEY");
    expect(result.modes[`${stem}.private.pem`]).toBe(0o600);
    expect(result.modes[`${stem}.public.pem`]).toBe(0o644);

    const message = Buffer.from("approval");
    const signature = sign(null, message, privatePem);
    expect(verify(null, message, publicPem, signature)).toBe(true);
    expect(result.out).not.toContain("PRIVATE KEY");
  });

  it("rejects an approver ID with a path separator", async () => {
    const result = await runKeys([
      "keys",
      "generate-approver-key",
      "--approver-id",
      "a/b",
      "--key-id",
      "k1",
      "--out-dir",
      "/approver",
    ]);

    expect(result.code).not.toBe(0);
    expect(result.err).toContain("--approver-id must use only");
  });
});

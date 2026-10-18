import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeKeyId,
  PRIVATE_KEY_MODE,
  writeKeyFile,
} from "../../scripts/lib/key-files.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const posix = process.platform !== "win32";

describe("assertSafeKeyId", () => {
  it.each([
    "manager-pavan-key-1",
    "verification-primary-20261014",
    "razorpay.demo_2",
    "A1",
  ])("accepts %s", (id) => {
    expect(assertSafeKeyId(id)).toBe(id);
  });

  it.each([
    "../escape",
    "nested/key",
    "nested\\key",
    "..",
    ".hidden",
    "-leading-dash",
    "has space",
    "semi;colon",
    "",
    "x".repeat(65),
  ])("refuses %j", (id) => {
    expect(() => assertSafeKeyId(id)).toThrow(/Unsafe key ID/);
  });
});

describe("writeKeyFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "key-files-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!posix)(
    "creates a private key owner-only, whatever the umask",
    () => {
      const path = join(dir, "k.private.pem");
      writeKeyFile(path, "secret", PRIVATE_KEY_MODE, false);

      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readFileSync(path, "utf8")).toBe("secret");
    },
  );

  it.skipIf(!posix)(
    "tightens an existing world-readable key when overwriting",
    () => {
      const path = join(dir, "k.private.pem");
      writeFileSync(path, "old");
      chmodSync(path, 0o644);

      writeKeyFile(path, "new", PRIVATE_KEY_MODE, true);

      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readFileSync(path, "utf8")).toBe("new");
    },
  );

  it("refuses to overwrite an existing key unless asked to", () => {
    const path = join(dir, "k.private.pem");
    writeFileSync(path, "old");

    expect(() => writeKeyFile(path, "new", PRIVATE_KEY_MODE, false)).toThrow();
    expect(readFileSync(path, "utf8")).toBe("old");
  });
});

describe("generate-keypair script", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "keygen-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(keyId: string) {
    return execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        join(repoRoot, "scripts", "generate-keypair.ts"),
        "--algorithm",
        "ed25519",
        "--key-id",
        keyId,
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, PARMANA_KEY_DIR: join(dir, "keys") },
        stdio: "pipe",
        timeout: 60_000,
      },
    );
  }

  it("refuses a traversal key ID and writes nothing outside or inside the key directory", () => {
    expect(() => run("../escape")).toThrow();

    expect(existsSync(join(dir, "escape.private.pem"))).toBe(false);
    expect(existsSync(join(dir, "keys", "escape.private.pem"))).toBe(false);
  });

  it.skipIf(!posix)(
    "writes a safe key ID with an owner-only private key",
    () => {
      run("unit-test-key");

      const privatePath = join(dir, "keys", "unit-test-key.private.pem");
      expect(statSync(privatePath).mode & 0o777).toBe(0o600);
      expect(existsSync(join(dir, "keys", "unit-test-key.public.pem"))).toBe(
        true,
      );
    },
  );
});

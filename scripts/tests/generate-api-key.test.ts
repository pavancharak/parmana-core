import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AuthorityType, parseApiKeys } from "@parmana/shared";

import {
  appendApiKeyEntry,
  formatApiKeysValue,
  generateApiKey,
  parseAllowedCapabilities,
  parseAllowedPrincipalIds,
  parseCredentialHolderType,
} from "../generate-api-key.js";

const API_KEY_HASH_PATTERN = /^[0-9a-f]{64}$/;

describe("generateApiKey", () => {
  it("produces a raw key with 256 bits of entropy", () => {
    const { rawKey } = generateApiKey({ callerId: "caller-1" });

    expect(Buffer.from(rawKey, "base64url")).toHaveLength(32);
  });

  it("produces two different raw keys across two calls", () => {
    const first = generateApiKey({ callerId: "caller-1" });
    const second = generateApiKey({ callerId: "caller-1" });

    expect(first.rawKey).not.toBe(second.rawKey);
  });

  it("produces a keyHash matching the server's hash pattern", () => {
    const { entry } = generateApiKey({ callerId: "caller-1" });

    expect(entry.keyHash).toMatch(API_KEY_HASH_PATTERN);
  });

  it("includes allowedPrincipalIds only when provided", () => {
    const withIds = generateApiKey({
      callerId: "caller-1",
      allowedPrincipalIds: ["principal-a", "principal-b"],
    });
    const withoutIds = generateApiKey({ callerId: "caller-1" });

    expect(withIds.entry.allowedPrincipalIds).toEqual([
      "principal-a",
      "principal-b",
    ]);
    expect(withoutIds.entry.allowedPrincipalIds).toBeUndefined();
  });

  it("rejects an empty caller id", () => {
    expect(() => generateApiKey({ callerId: "   " })).toThrow(
      "--caller-id must be a non-empty string.",
    );
  });

  it("includes allowedCapabilities only when provided", () => {
    const withCapabilities = generateApiKey({
      callerId: "caller-1",
      allowedCapabilities: ["razorpay:refund-create", "razorpay:refund-fetch"],
    });
    const withoutCapabilities = generateApiKey({ callerId: "caller-1" });

    expect(withCapabilities.entry.allowedCapabilities).toEqual([
      "razorpay:refund-create",
      "razorpay:refund-fetch",
    ]);
    expect(withoutCapabilities.entry.allowedCapabilities).toBeUndefined();
  });

  it("includes credentialHolderType only when provided", () => {
    const withType = generateApiKey({
      callerId: "caller-1",
      credentialHolderType: AuthorityType.USER,
    });
    const withoutType = generateApiKey({ callerId: "caller-1" });

    expect(withType.entry.credentialHolderType).toBe(AuthorityType.USER);
    expect(withoutType.entry.credentialHolderType).toBeUndefined();
  });

  it("produces an entry that parseApiKeys accepts, matching the generated callerId", () => {
    const { entry } = generateApiKey({ callerId: "design-partner-gocredit" });

    const [parsed] = parseApiKeys(JSON.stringify([entry]));

    expect(parsed).toEqual(entry);
    expect(parsed?.callerId).toBe("design-partner-gocredit");
  });

  it("generates a step-up keypair only when generateStepUpKey is requested with credentialHolderType USER", () => {
    const withKey = generateApiKey({
      callerId: "caller-1",
      credentialHolderType: AuthorityType.USER,
      generateStepUpKey: true,
    });

    expect(withKey.stepUpPrivateKey).toMatch(/BEGIN PRIVATE KEY/);
    expect(withKey.entry.stepUpPublicKey).toMatch(/BEGIN PUBLIC KEY/);

    const withoutKey = generateApiKey({ callerId: "caller-1" });

    expect(withoutKey.stepUpPrivateKey).toBeUndefined();
    expect(withoutKey.entry.stepUpPublicKey).toBeUndefined();
  });

  it("produces a genuinely independent step-up keypair from the bearer key across two calls", () => {
    const first = generateApiKey({
      callerId: "caller-1",
      credentialHolderType: AuthorityType.USER,
      generateStepUpKey: true,
    });
    const second = generateApiKey({
      callerId: "caller-1",
      credentialHolderType: AuthorityType.USER,
      generateStepUpKey: true,
    });

    expect(first.stepUpPrivateKey).not.toBe(second.stepUpPrivateKey);
    expect(first.entry.stepUpPublicKey).not.toBe(second.entry.stepUpPublicKey);
    expect(first.rawKey).not.toBe(first.stepUpPrivateKey);
  });

  it("rejects --generate-step-up-key without credentialHolderType USER", () => {
    expect(() =>
      generateApiKey({ callerId: "caller-1", generateStepUpKey: true }),
    ).toThrow("--generate-step-up-key requires --credential-holder-type USER");

    expect(() =>
      generateApiKey({
        callerId: "caller-1",
        credentialHolderType: AuthorityType.SERVICE,
        generateStepUpKey: true,
      }),
    ).toThrow("--generate-step-up-key requires --credential-holder-type USER");
  });

  it("produces an entry (with stepUpPublicKey) that parseApiKeys accepts", () => {
    const { entry } = generateApiKey({
      callerId: "caller-1",
      credentialHolderType: AuthorityType.USER,
      generateStepUpKey: true,
    });

    const [parsed] = parseApiKeys(JSON.stringify([entry]));

    expect(parsed).toEqual(entry);
  });
});

describe("formatApiKeysValue", () => {
  it("round-trips through parseApiKeys in json format", () => {
    const { entry } = generateApiKey({ callerId: "caller-1" });

    const printed = formatApiKeysValue([entry], "json");
    const parsed = parseApiKeys(printed);

    expect(parsed).toEqual([entry]);
  });

  it("round-trips through parseApiKeys in env format", () => {
    const { entry } = generateApiKey({ callerId: "caller-1" });

    const printed = formatApiKeysValue([entry], "env");

    expect(printed.startsWith("PARMANA_API_KEYS=")).toBe(true);

    const parsed = parseApiKeys(printed.slice("PARMANA_API_KEYS=".length));

    expect(parsed).toEqual([entry]);
  });
});

describe("parseAllowedPrincipalIds", () => {
  it("returns undefined when not provided", () => {
    expect(parseAllowedPrincipalIds(undefined)).toBeUndefined();
  });

  it("splits, trims, and drops empty values", () => {
    expect(parseAllowedPrincipalIds(" a , b ,,c")).toEqual(["a", "b", "c"]);
  });

  it("throws when given but every value is empty", () => {
    expect(() => parseAllowedPrincipalIds(" , ,")).toThrow(
      "contained no non-empty values",
    );
  });
});

describe("parseAllowedCapabilities", () => {
  it("returns undefined when not provided", () => {
    expect(parseAllowedCapabilities(undefined)).toBeUndefined();
  });

  it("splits, trims, and drops empty values", () => {
    expect(
      parseAllowedCapabilities(
        " razorpay:refund-create , razorpay:refund-fetch ,,hubspot:deal-update",
      ),
    ).toEqual([
      "razorpay:refund-create",
      "razorpay:refund-fetch",
      "hubspot:deal-update",
    ]);
  });

  it('accepts the "*" wildcard as an ordinary value', () => {
    expect(parseAllowedCapabilities("*")).toEqual(["*"]);
  });

  it("throws when given but every value is empty", () => {
    expect(() => parseAllowedCapabilities(" , ,")).toThrow(
      "contained no non-empty values",
    );
  });
});

describe("parseCredentialHolderType", () => {
  it("returns undefined when not provided", () => {
    expect(parseCredentialHolderType(undefined)).toBeUndefined();
  });

  it("accepts each valid AuthorityType value, trimmed", () => {
    expect(parseCredentialHolderType(" USER ")).toBe(AuthorityType.USER);
    expect(parseCredentialHolderType("ROLE")).toBe(AuthorityType.ROLE);
    expect(parseCredentialHolderType("SERVICE")).toBe(AuthorityType.SERVICE);
    expect(parseCredentialHolderType("ORGANIZATION")).toBe(
      AuthorityType.ORGANIZATION,
    );
  });

  it("throws naming the valid values for an unrecognized value", () => {
    expect(() => parseCredentialHolderType("HUMAN")).toThrow(
      "--credential-holder-type must be one of",
    );
  });
});

describe("appendApiKeyEntry", () => {
  let dir: string;

  it.skipIf(process.platform === "win32")(
    "writes the key file owner-only, even when it already exists world-readable",
    () => {
      dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
      const path = join(dir, ".env");
      writeFileSync(path, "PARMANA_API_KEYS=[]\n");
      chmodSync(path, 0o644);

      const { entry } = generateApiKey({ callerId: "caller-1" });
      appendApiKeyEntry(path, entry);

      expect(statSync(path).mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === "win32")(
    "writes a JSON key file owner-only",
    () => {
      dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
      const path = join(dir, "keys.json");

      const { entry } = generateApiKey({ callerId: "caller-2" });
      appendApiKeyEntry(path, entry);

      expect(statSync(path).mode & 0o777).toBe(0o600);
    },
  );

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("creates a new .env-style file when none exists", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, ".env");

    const { entry } = generateApiKey({ callerId: "caller-1" });
    const result = appendApiKeyEntry(path, entry);

    expect(result.totalEntries).toBe(1);

    const content = readFileSync(path, "utf8");
    const parsed = parseApiKeys(
      content.match(/^PARMANA_API_KEYS=(.*)$/m)?.[1] ?? "",
    );

    expect(parsed).toEqual([entry]);
  });

  it("appends to an existing .env file without disturbing other lines", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, ".env");
    writeFileSync(
      path,
      'NODE_ENV=production\nPARMANA_API_KEYS=[{"callerId":"existing","keyHash":"' +
        "0".repeat(64) +
        '"}]\nPORT=3000\n',
    );

    const { entry } = generateApiKey({ callerId: "caller-2" });
    const result = appendApiKeyEntry(path, entry);

    expect(result.totalEntries).toBe(2);

    const content = readFileSync(path, "utf8");

    expect(content).toContain("NODE_ENV=production");
    expect(content).toContain("PORT=3000");

    const parsed = parseApiKeys(
      content.match(/^PARMANA_API_KEYS=(.*)$/m)?.[1] ?? "",
    );

    expect(parsed?.map((e) => e.callerId)).toEqual(["existing", "caller-2"]);
  });

  it("appends to an existing bare JSON array file", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, "api-keys.json");
    writeFileSync(
      path,
      JSON.stringify([{ callerId: "existing", keyHash: "0".repeat(64) }]),
    );

    const { entry } = generateApiKey({ callerId: "caller-2" });
    const result = appendApiKeyEntry(path, entry);

    expect(result.totalEntries).toBe(2);

    const parsed = parseApiKeys(readFileSync(path, "utf8"));

    expect(parsed?.map((e) => e.callerId)).toEqual(["existing", "caller-2"]);
  });

  it("throws on a callerId collision without --replace", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, "api-keys.json");
    writeFileSync(
      path,
      JSON.stringify([{ callerId: "dup", keyHash: "0".repeat(64) }]),
    );

    const { entry } = generateApiKey({ callerId: "dup" });

    expect(() => appendApiKeyEntry(path, entry)).toThrow(
      'Caller ID "dup" already has an entry',
    );

    const untouched = parseApiKeys(readFileSync(path, "utf8"));
    expect(untouched).toEqual([{ callerId: "dup", keyHash: "0".repeat(64) }]);
  });

  it("replaces the colliding entry when --replace is passed", () => {
    dir = mkdtempSync(join(tmpdir(), "generate-api-key-test-"));
    const path = join(dir, "api-keys.json");
    writeFileSync(
      path,
      JSON.stringify([{ callerId: "dup", keyHash: "0".repeat(64) }]),
    );

    const { entry } = generateApiKey({ callerId: "dup" });
    const result = appendApiKeyEntry(path, entry, { replace: true });

    expect(result.totalEntries).toBe(1);

    const parsed = parseApiKeys(readFileSync(path, "utf8"));
    expect(parsed).toEqual([entry]);
  });
});

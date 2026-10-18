import { createPublicKey } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import { APPROVAL_ARTIFACT_CRYPTO_PROVIDER } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";

import {
  approverKeyFileNames,
  generateApproverKey,
} from "../generate-approver-key.js";
import {
  DEFAULT_TTL_SECONDS,
  parseSignApprovalArguments,
  signApproval,
} from "../sign-approval.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "parmana-approver-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function signArgs(privateKeyFile: string, extra: string[] = []): string[] {
  return [
    "--private-key-file",
    privateKeyFile,
    "--approver-id",
    "manager-priya",
    "--key-id",
    "manager-priya-key-1",
    "--capability",
    "paytm:refund",
    "--resource-id",
    "ORD-1042",
    "--max-amount",
    "75000",
    ...extra,
  ];
}

describe("generate-approver-key", () => {
  it("writes the key pair under the file name the server loads", () => {
    const dir = tempDir();
    const files = generateApproverKey(
      dir,
      "manager-priya",
      "manager-priya-key-1",
    );

    expect(files.publicKeyPath).toBe(
      join(dir, "manager-priya__manager-priya-key-1.public.pem"),
    );
    expect(
      createPublicKey(readFileSync(files.publicKeyPath, "utf8"))
        .asymmetricKeyType,
    ).toBe("ed25519");
    if (process.platform !== "win32") {
      expect(statSync(files.privateKeyPath).mode & 0o777).toBe(0o600);
    }
  });

  it("refuses to overwrite an existing key", () => {
    const dir = tempDir();
    generateApproverKey(dir, "manager-priya", "manager-priya-key-1");

    expect(() =>
      generateApproverKey(dir, "manager-priya", "manager-priya-key-1"),
    ).toThrow("Refusing to overwrite");
  });

  it("rejects ids that would change the file path", () => {
    expect(() => approverKeyFileNames("/x", "../evil", "k")).toThrow(
      "--approver-id",
    );
    expect(() => approverKeyFileNames("/x", "a", "k/1")).toThrow("--key-id");
  });
});

describe("sign-approval", () => {
  it("produces an approval the server's verifier accepts for that order and amount, once", async () => {
    const dir = tempDir();
    const files = generateApproverKey(
      dir,
      "manager-priya",
      "manager-priya-key-1",
    );

    const approval = await signApproval(
      parseSignApprovalArguments(signArgs(files.privateKeyPath)),
    );

    const verifier = new ApprovalVerifier({
      crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
      issuerRegistry: new StaticApprovalIssuerRegistry([
        {
          approverId: "manager-priya",
          keyId: "manager-priya-key-1",
          publicKey: createPublicKey(readFileSync(files.publicKeyPath, "utf8")),
          revoked: false,
        },
      ]),
      nonceStore: new MemoryNonceStore(),
    });

    const request = {
      action: "paytm:refund",
      resourceId: "ORD-1042",
      requestedValue: 75_000,
    };
    const asJson = JSON.parse(JSON.stringify(approval));

    expect((await verifier.verify(asJson, request)).valid).toBe(true);
    expect((await verifier.verify(asJson, request)).valid).toBe(false);
    expect(approval.payload.scope).toEqual({
      field: "value",
      comparator: "lte",
      value: 75_000,
    });
  });

  it("reads --out when given", () => {
    expect(parseSignApprovalArguments(signArgs("k.pem")).out).toBeUndefined();
    expect(
      parseSignApprovalArguments(signArgs("k.pem", ["--out", "a.json"])).out,
    ).toBe("a.json");
  });

  it("defaults to a 15 minute approval", () => {
    expect(parseSignApprovalArguments(signArgs("k.pem")).ttlSeconds).toBe(
      DEFAULT_TTL_SECONDS,
    );
    expect(DEFAULT_TTL_SECONDS).toBe(900);
  });

  it("signs for any action, and without --max-amount names exactly the resource", async () => {
    const dir = tempDir();
    const files = generateApproverKey(
      dir,
      "manager-priya",
      "manager-priya-key-1",
    );
    const args = signArgs(files.privateKeyPath);
    args[args.indexOf("paytm:refund")] = "github:pr-merge";
    args[args.indexOf("ORD-1042")] = "42";
    args.splice(args.indexOf("--max-amount"), 2);

    const parsed = parseSignApprovalArguments(args);
    const approval = await signApproval(parsed);

    expect(parsed.maxAmount).toBeUndefined();
    expect(approval.payload.capability).toBe("github:pr-merge");
    expect(approval.payload.scope).toEqual({
      field: "resourceId",
      comparator: "eq",
      value: "42",
    });

    const verifier = new ApprovalVerifier({
      crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
      issuerRegistry: new StaticApprovalIssuerRegistry([
        {
          approverId: "manager-priya",
          keyId: "manager-priya-key-1",
          publicKey: createPublicKey(readFileSync(files.publicKeyPath, "utf8")),
          revoked: false,
        },
      ]),
      nonceStore: new MemoryNonceStore(),
    });

    expect(
      (
        await verifier.verify(JSON.parse(JSON.stringify(approval)), {
          action: "github:pr-merge",
          resourceId: "42",
          requestedValue: "42",
        })
      ).valid,
    ).toBe(true);
  });

  it.each([
    [["--capability", "refund"], "--capability"],
    [["--capability", "paytm refund"], "--capability"],
    [["--max-amount", "0"], "--max-amount"],
    [["--max-amount", "abc"], "--max-amount"],
    [["--ttl-seconds", "0"], "--ttl-seconds"],
    [["--ttl-seconds", "86401"], "--ttl-seconds"],
    [["--resource-id", ""], "--resource-id"],
  ])("rejects %j", (override, message) => {
    const args = signArgs("k.pem");
    const index = args.indexOf(override[0]);

    if (index === -1) {
      args.push(...override);
    } else {
      args[index + 1] = override[1];
    }

    expect(() => parseSignApprovalArguments(args)).toThrow(message);
  });
});

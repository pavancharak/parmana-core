import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { StaticApprovalIssuerRegistry } from "@parmana/approval";
import { MemoryApprovalIssuerRepository } from "@parmana/storage";
import {
  PendingPolicyChangeStatus,
  type ApprovalIssuerRepository,
} from "@parmana/shared";

import { GovernedApprovalIssuerRegistry } from "../../../src/bootstrap/createApprovalIssuerRegistry.js";

const pem = (key = generateKeyPairSync("ed25519").publicKey) =>
  key.export({ type: "spki", format: "pem" }).toString();

async function repositoryWith(
  approverId: string,
  keyId: string,
  publicKeyPem: string,
) {
  const repository = new MemoryApprovalIssuerRepository();
  await repository.createChange({
    changeId: "c-1",
    action: "add",
    approverId,
    keyId,
    publicKeyPem,
    reason: "Test.",
    proposedBy: "maker",
    proposedAt: new Date(),
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
  });
  await repository.approveChange("c-1", "checker", new Date());
  return repository;
}

describe("GovernedApprovalIssuerRegistry", () => {
  const codeKeys = generateKeyPairSync("ed25519");
  const code = new StaticApprovalIssuerRegistry([
    {
      approverId: "in-code",
      keyId: "k1",
      publicKey: codeKeys.publicKey,
      revoked: false,
    },
  ]);

  it("answers from code first, then from the table", async () => {
    const tableKeys = generateKeyPairSync("ed25519");
    const registry = new GovernedApprovalIssuerRegistry(
      code,
      await repositoryWith("in-table", "k1", pem(tableKeys.publicKey)),
    );

    expect((await registry.resolve("in-code", "k1"))?.publicKey).toBe(
      codeKeys.publicKey,
    );
    const fromTable = await registry.resolve("in-table", "k1");
    expect(fromTable?.revoked).toBe(false);
    expect(
      fromTable?.publicKey.export({ type: "spki", format: "pem" }).toString(),
    ).toBe(pem(tableKeys.publicKey));
    expect(await registry.resolve("nobody", "k1")).toBeUndefined();
    expect(registry.isInCode("in-code", "k1")).toBe(true);
  });

  it("treats the issuer as unknown when the table cannot be read", async () => {
    const failing = {
      findIssuer: vi.fn(async () => {
        throw new Error("connection refused");
      }),
    } as unknown as ApprovalIssuerRepository;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const registry = new GovernedApprovalIssuerRegistry(code, failing);

    expect(await registry.resolve("in-table", "k1")).toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ event: "approval_issuer_lookup_failed" }),
    );
    logged.mockRestore();
  });

  it("treats a stored key that is not Ed25519 as unknown", async () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const registry = new GovernedApprovalIssuerRegistry(
      code,
      await repositoryWith("in-table", "k1", pem(rsa.publicKey)),
    );

    expect(await registry.resolve("in-table", "k1")).toBeUndefined();
    logged.mockRestore();
  });
});

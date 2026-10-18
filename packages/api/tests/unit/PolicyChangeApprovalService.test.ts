import { describe, expect, it } from "vitest";

import { PolicyNotFoundError } from "@parmana/policy";
import type { Policy, PolicyRepository } from "@parmana/policy";
import { PolicyChangeCrypto } from "@parmana/crypto";
import type { PendingPolicyChange } from "@parmana/shared";
import { ConflictError, PendingPolicyChangeStatus } from "@parmana/shared";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import { PolicyChangeApprovalService } from "../../src/governance/PolicyChangeApprovalService.js";

function pendingChange(): PendingPolicyChange {
  return {
    pendingPolicyChangeId: "ppc-ordering-test",
    policyName: "vendor-payment",
    policyVersion: "1.0.0",
    proposedContent: {
      policyId: "vendor-payment",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: [],
    },
    proposedBy: "human-maker",
    proposedAt: new Date("2026-08-01T00:00:00.000Z"),
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
    reason: "test",
  };
}

describe("PolicyChangeApprovalService ordering: record persisted before the live file write", () => {
  it("has already persisted the signed approval record when the live file write fails", async () => {
    const writeError = new Error("simulated disk failure writing policy.json");
    let saveCalled = false;

    const policyRepository: PolicyRepository = {
      async load(): Promise<Policy> {
        throw new PolicyNotFoundError("vendor-payment", "1.0.0");
      },
      async save(): Promise<void> {
        saveCalled = true;
        throw writeError;
      },
    };

    const policyChangeApprovalRecordRepository =
      new MemoryPolicyChangeApprovalRecordRepository();

    const service = new PolicyChangeApprovalService({
      policyRepository,
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository,
    });

    const change = pendingChange();

    // The file write fails -- if the code wrote the file BEFORE
    // persisting the record, this rejection would happen with no
    // record ever created. Asserting the opposite here is the actual
    // proof of ordering, not merely a description of it.
    await expect(service.approve(change, "human-checker")).rejects.toBe(
      writeError,
    );

    expect(saveCalled).toBe(true);

    const records = await policyChangeApprovalRecordRepository.list();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      pendingPolicyChangeId: change.pendingPolicyChangeId,
      policyName: change.policyName,
      policyVersion: change.policyVersion,
      approvedBy: "human-checker",
    });

    // The record is genuinely signed, not a placeholder -- verifiable
    // independently of the service that produced it.
    await expect(new PolicyChangeCrypto().verify(records[0])).resolves.toBe(
      true,
    );
  });

  it("never attempts the live file write when persisting the approval record fails", async () => {
    let saveCalled = false;

    const policyRepository: PolicyRepository = {
      async load(): Promise<Policy> {
        throw new PolicyNotFoundError("vendor-payment", "1.0.0");
      },
      async save(): Promise<void> {
        saveCalled = true;
      },
    };

    const recordPersistError = new Error(
      "simulated storage failure persisting the approval record",
    );

    const policyChangeApprovalRecordRepository = {
      async create(): Promise<never> {
        throw recordPersistError;
      },
      async findById() {
        return null;
      },
      async list() {
        return [];
      },
      async findMostRecentFor() {
        return null;
      },
      async findMostRecentForName() {
        return null;
      },
      async findByPendingPolicyChangeId() {
        return null;
      },
    };

    const service = new PolicyChangeApprovalService({
      policyRepository,
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository,
    });

    await expect(
      service.approve(pendingChange(), "human-checker"),
    ).rejects.toBe(recordPersistError);

    // The other half of the ordering guarantee: a failure persisting
    // the record must never let the live file get written anyway --
    // that would be the exact "file changed, no evidence it was
    // approved" gap the ordering is designed to prevent.
    expect(saveCalled).toBe(false);
  });
});

describe("PolicyChangeApprovalService retry after a partial failure", () => {
  function setup() {
    let failSave = true;
    const saved: string[] = [];

    const policyRepository: PolicyRepository = {
      async load(): Promise<Policy> {
        throw new PolicyNotFoundError("vendor-payment", "1.0.0");
      },
      async save(name: string, version: string): Promise<void> {
        if (failSave) {
          throw new Error("simulated disk failure writing policy.json");
        }

        saved.push(`${name}@${version}`);
      },
    };

    const policyChangeApprovalRecordRepository =
      new MemoryPolicyChangeApprovalRecordRepository();

    const service = new PolicyChangeApprovalService({
      policyRepository,
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository,
    });

    return {
      service,
      policyChangeApprovalRecordRepository,
      saved,
      recover: () => {
        failSave = false;
      },
    };
  }

  it("lets the same approver finish, reusing the record the first attempt wrote", async () => {
    const { service, policyChangeApprovalRecordRepository, saved, recover } =
      setup();
    const change = pendingChange();

    await expect(service.approve(change, "human-checker")).rejects.toThrow(
      /simulated disk failure/,
    );
    const [first] = await policyChangeApprovalRecordRepository.list();

    recover();
    const second = await service.approve(change, "human-checker");

    expect(second).toEqual(first);
    expect(await policyChangeApprovalRecordRepository.list()).toHaveLength(1);
    expect(saved).toEqual(["vendor-payment@1.0.0"]);
  });

  it("refuses a different approver with 409 and writes nothing", async () => {
    const { service, policyChangeApprovalRecordRepository, saved, recover } =
      setup();
    const change = pendingChange();

    await expect(service.approve(change, "human-checker")).rejects.toThrow(
      /simulated disk failure/,
    );

    recover();
    const error = await service
      .approve(change, "another-checker")
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).status).toBe(409);
    expect(await policyChangeApprovalRecordRepository.list()).toHaveLength(1);
    expect(saved).toEqual([]);
  });
});

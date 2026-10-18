import { describe, expect, it } from "vitest";

import type {
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
} from "@parmana/shared";

import type { Policy, PolicyRepository } from "@parmana/policy";

import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";
import { Runtime } from "../../src/Runtime.js";
import type { RuntimeComponent } from "../../src/RuntimeComponent.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

class FixedPolicyRepository implements PolicyRepository {
  async load(): Promise<Policy> {
    throw new Error("not used by these tests");
  }

  async save(): Promise<void> {
    throw new Error("not used by these tests");
  }
}

class NullExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    return record;
  }

  async findByTransactionId(): Promise<ExecutionTrustRecord | null> {
    return null;
  }

  async appendExecution(): Promise<void> {}

  async replaceExecution(): Promise<void> {}

  async appendOverride(): Promise<void> {}

  async appendVerification(): Promise<void> {}

  async appendReceipt(): Promise<void> {}
}

const noopStage: RuntimeComponent = {
  async execute(context: RuntimeContext): Promise<RuntimeContext> {
    return context;
  },
};

describe("RuntimeBuilder", () => {
  it("throws when built without a PolicyRepository", () => {
    expect(() =>
      new RuntimeBuilder().build(new NullExecutionTrustRecordRepository()),
    ).toThrow("PolicyRepository is required.");
  });

  it("builds a Runtime once a PolicyRepository is configured", () => {
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .build(new NullExecutionTrustRecordRepository());

    expect(runtime).toBeInstanceOf(Runtime);
    expect(runtime.isEmpty()).toBe(true);
    expect(runtime.size()).toBe(0);
  });

  it("addStage() and addStages() accumulate pipeline stages", () => {
    const runtimeWithOneStage = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .addStage(noopStage)
      .build(new NullExecutionTrustRecordRepository());

    expect(runtimeWithOneStage.size()).toBe(1);

    const runtimeWithMultipleStages = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .addStages(noopStage, noopStage, noopStage)
      .build(new NullExecutionTrustRecordRepository());

    expect(runtimeWithMultipleStages.size()).toBe(3);
  });

  it("clearStages() removes previously added stages", () => {
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .addStages(noopStage, noopStage)
      .clearStages()
      .build(new NullExecutionTrustRecordRepository());

    expect(runtime.isEmpty()).toBe(true);
  });
});

import { ExecutionRejectedError } from "@parmana/sdk";
import { describe, expect, it } from "vitest";

import { type AgentClient, CAPABILITY, requestRefund } from "../agent.js";

const PAYMENT = "pay_TestPayment123";

interface SentTransaction {
  readonly businessTransactionId: string;
  readonly intent: Record<string, unknown>;
  readonly signals: Record<string, unknown>;
}

/** A fake Parmana: records every call, and answers as the case needs. */
function fakeParmana(options: { reject?: boolean; fail?: Error } = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const executed: Record<string, unknown>[] = [];

  const client = {
    async caller() {
      calls.push({ name: "caller", args: [] });
      return { callerId: "razorpay-refund-agent" };
    },
    async policyInEffect(capability: string) {
      calls.push({ name: "policyInEffect", args: [capability] });
      return { policy: { name: "razorpay-refund", version: "1.0.0" } };
    },
    async execute(transaction: Record<string, unknown>) {
      calls.push({ name: "execute", args: [transaction] });
      executed.push(transaction);

      if (options.fail !== undefined) {
        throw options.fail;
      }

      if (options.reject) {
        throw new ExecutionRejectedError("refused");
      }

      return { executions: [{ evidence: { result: { success: true } } }] };
    },
    async refusalRecord(businessTransactionId: string) {
      calls.push({ name: "refusalRecord", args: [businessTransactionId] });
      return {
        decision: {
          matchedRuleId: "reject-manager-approval-required",
          reason: "no signed manager approval",
        },
      };
    },
  };

  return { client: client as unknown as AgentClient, calls, executed };
}

describe("requestRefund input checks", () => {
  it.each([
    ["not a payment id", { paymentId: "order_123", amountPaise: 100 }],
    ["a fraction of paise", { paymentId: PAYMENT, amountPaise: 1.5 }],
    ["zero", { paymentId: PAYMENT, amountPaise: 0 }],
    ["negative", { paymentId: PAYMENT, amountPaise: -100 }],
  ])("refuses %s before calling Parmana", async (_label, input) => {
    const parmana = fakeParmana();

    await expect(requestRefund(parmana.client, input)).rejects.toThrow();
    expect(parmana.calls).toHaveLength(0);
  });
});

describe("requestRefund", () => {
  it("submits the refund as razorpay:refund, with the payment as target and the amount in paise", async () => {
    const parmana = fakeParmana();
    const approval = { approverId: "manager" };

    const decision = await requestRefund(parmana.client, {
      paymentId: PAYMENT,
      amountPaise: 100,
      approval,
    });

    expect(decision.status).toBe("APPROVED");
    expect(parmana.calls.map((call) => call.name)).toEqual([
      "caller",
      "policyInEffect",
      "execute",
    ]);
    expect(parmana.calls[1]?.args).toEqual([CAPABILITY]);

    const transaction = parmana.executed[0] as unknown as SentTransaction;
    expect(transaction.intent).toMatchObject({
      action: CAPABILITY,
      target: PAYMENT,
      parameters: { amount: 100 },
    });
    expect(transaction.signals).toMatchObject({
      refundAmount: 100,
      managerApproved: true,
      approvalArtifact: approval,
    });
    expect(decision.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
  });

  it("sends without approval as managerApproved false, and reports the refusal", async () => {
    const parmana = fakeParmana({ reject: true });

    const decision = await requestRefund(parmana.client, {
      paymentId: PAYMENT,
      amountPaise: 100,
    });

    const transaction = parmana.executed[0] as unknown as SentTransaction;
    expect(transaction.signals.managerApproved).toBe(false);
    expect(transaction.signals).not.toHaveProperty("approvalArtifact");

    expect(decision).toMatchObject({
      status: "REFUSED",
      rule: "reject-manager-approval-required",
      reason: "no signed manager approval",
    });
    expect(parmana.calls.at(-1)).toEqual({
      name: "refusalRecord",
      args: [decision.businessTransactionId],
    });
  });

  it("passes any other failure up, rather than reporting it as a refusal", async () => {
    const parmana = fakeParmana({ fail: new Error("network down") });

    await expect(
      requestRefund(parmana.client, { paymentId: PAYMENT, amountPaise: 100 }),
    ).rejects.toThrow("network down");
    expect(parmana.calls.map((call) => call.name)).not.toContain(
      "refusalRecord",
    );
  });
});

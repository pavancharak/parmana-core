/**
 * A fresh refund agent for Razorpay, under Parmana. It asks Parmana to
 * release one refund of a Razorpay payment. Parmana decides; when it
 * releases, the endpoint in examples/razorpay-refund refunds in Razorpay
 * test mode.
 *
 * The agent holds no Razorpay credential and no approval key. It checks
 * its input before it calls anything, and it returns Parmana's signed
 * record either way: APPROVED with the execution record, or REFUSED with
 * the refusal record.
 */

import {
  createBusinessTransaction,
  ExecutionRejectedError,
  type ParmanaClient,
} from "@parmana/sdk";

export const CAPABILITY = "razorpay:refund";

const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

export type AgentClient = Pick<
  ParmanaClient,
  "caller" | "policyInEffect" | "execute" | "refusalRecord"
>;

export interface RefundInput {
  /** Razorpay payment id, pay_... */
  readonly paymentId: string;
  /** Paise, a positive whole number. 100 is ₹1. */
  readonly amountPaise: number;
  /** A manager's signed approval for this payment and amount, if there is one. */
  readonly approval?: unknown;
  readonly purpose?: string;
}

export type RefundDecision =
  | {
      readonly status: "APPROVED";
      readonly businessTransactionId: string;
      readonly record: Awaited<ReturnType<ParmanaClient["execute"]>>;
    }
  | {
      readonly status: "REFUSED";
      readonly businessTransactionId: string;
      readonly record: Awaited<ReturnType<ParmanaClient["refusalRecord"]>>;
      readonly rule: string;
      readonly reason: string;
    };

/** Throws before any call is made if the input cannot be a refund. */
export function validateRefundInput(input: RefundInput): void {
  if (!PAYMENT_ID.test(input.paymentId)) {
    throw new Error("The payment must be a Razorpay payment id (pay_...).");
  }

  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new Error(
      "The amount must be a positive whole number of paise (100 is ₹1).",
    );
  }
}

export async function requestRefund(
  client: AgentClient,
  input: RefundInput,
): Promise<RefundDecision> {
  validateRefundInput(input);

  const me = await client.caller();
  const inEffect = await client.policyInEffect(CAPABILITY);
  const approval = input.approval;

  const transaction = createBusinessTransaction({
    principalId: me.callerId,
    purpose: input.purpose ?? `Razorpay refund of ${input.paymentId}`,
    action: CAPABILITY,
    target: input.paymentId,
    parameters: { amount: input.amountPaise },
    policy: inEffect.policy,
    signals: {
      refundAmount: input.amountPaise,
      managerApproved: approval !== undefined,
      ...(approval !== undefined ? { approvalArtifact: approval } : {}),
    } as never,
  });

  const businessTransactionId = transaction.businessTransactionId;

  try {
    const record = await client.execute(transaction);
    return { status: "APPROVED", businessTransactionId, record };
  } catch (error) {
    if (!(error instanceof ExecutionRejectedError)) {
      throw error;
    }

    const record = await client.refusalRecord(businessTransactionId);

    return {
      status: "REFUSED",
      businessTransactionId,
      record,
      rule: record.decision.matchedRuleId ?? "not recorded",
      reason: record.decision.reason ?? "not recorded",
    };
  }
}

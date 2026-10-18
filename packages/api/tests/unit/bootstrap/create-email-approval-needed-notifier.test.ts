import { describe, expect, it, vi } from "vitest";

import type { ApprovalNeededEvent } from "@parmana/runtime";

import {
  EmailApprovalNeededNotifier,
  composeApprovalEmail,
  createEmailApprovalNeededNotifier,
  type ApprovalEmail,
} from "../../../src/bootstrap/createEmailApprovalNeededNotifier.js";
import {
  CompositeApprovalNeededNotifier,
  createApprovalNeededNotifier,
} from "../../../src/bootstrap/createApprovalNeededNotifier.js";

const event: ApprovalNeededEvent = {
  type: "approval.needed",
  occurredAt: "2026-09-29T10:15:02.114Z",
  businessTransactionId: "btx-1",
  decisionId: "d-1",
  decisionOutcome: "APPROVED",
  action: "paytm:refund",
  target: "paytm://orders/ORD-1042",
  policyId: "customer-refund",
  policyVersion: "1.2.0",
  reason: "No rule matched.",
  submittedBy: "refund-agent",
  approvals: [
    { signal: "managerApproved", resourceId: "ORD-1042", value: 75000 },
  ],
};

const resend = {
  RESEND_API_KEY: "re_test",
  RESEND_EMAIL_DOMAIN: "notify.parmanasystems.com",
};

describe("composeApprovalEmail", () => {
  it("names what to sign, with one idempotency key per refusal", () => {
    const email = composeApprovalEmail(event, "from@x.test", ["a@x.test"]);

    expect(email.subject).toBe(
      "Approval needed: paytm:refund ORD-1042 up to 75000",
    );
    expect(email.idempotencyKey).toBe("approval-needed/d-1");
    expect(email.text).toContain("capability  paytm:refund");
    expect(email.text).toContain("resourceId  ORD-1042");
    expect(email.text).toContain("maxAmount   75000");
    expect(email.text).toContain("Transaction:  btx-1");
    expect(email.text).toContain("Sent by:      refund-agent");
  });

  it("escapes the HTML copy", () => {
    const email = composeApprovalEmail(
      { ...event, target: "<script>x</script>" },
      "f@x.test",
      ["a@x.test"],
    );

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("leaves out an amount the policy does not declare", () => {
    const email = composeApprovalEmail(
      {
        ...event,
        action: "github:pr-merge",
        approvals: [{ signal: "mergeApproved", resourceId: "acme/api#42" }],
      },
      "f@x.test",
      ["a@x.test"],
    );

    expect(email.subject).toBe("Approval needed: github:pr-merge acme/api#42");
    expect(email.text).not.toContain("maxAmount");
  });
});

describe("createEmailApprovalNeededNotifier", () => {
  it("is off without APPROVAL_EMAIL_TO", () => {
    expect(createEmailApprovalNeededNotifier({ ...resend })).toBeUndefined();
  });

  it("refuses bad addresses, a missing key, and a missing sender", () => {
    expect(() =>
      createEmailApprovalNeededNotifier({
        ...resend,
        APPROVAL_EMAIL_TO: "not-an-email",
      }),
    ).toThrow(/email addresses/);
    expect(() =>
      createEmailApprovalNeededNotifier({
        APPROVAL_EMAIL_TO: "a@x.test",
        RESEND_EMAIL_DOMAIN: "notify.parmanasystems.com",
      }),
    ).toThrow(/RESEND_API_KEY/);
    expect(() =>
      createEmailApprovalNeededNotifier({
        APPROVAL_EMAIL_TO: "a@x.test",
        RESEND_API_KEY: "re_test",
      }),
    ).toThrow(/sender/);
  });

  it("sends from approvals@ the Resend domain, to every address", async () => {
    const sent: ApprovalEmail[] = [];
    const notifier = createEmailApprovalNeededNotifier(
      { ...resend, APPROVAL_EMAIL_TO: "a@x.test, b@x.test" },
      () => async (email) => {
        sent.push(email);
        return {};
      },
    );

    await notifier?.notify(event);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.from).toBe(
      "Parmana approvals <approvals@notify.parmanasystems.com>",
    );
    expect(sent[0]?.to).toEqual(["a@x.test", "b@x.test"]);
  });

  it("uses APPROVAL_EMAIL_FROM when set", async () => {
    const sent: ApprovalEmail[] = [];
    await createEmailApprovalNeededNotifier(
      {
        ...resend,
        APPROVAL_EMAIL_TO: "a@x.test",
        APPROVAL_EMAIL_FROM: "Ops <ops@notify.parmanasystems.com>",
      },
      () => async (email) => {
        sent.push(email);
        return {};
      },
    )?.notify(event);

    expect(sent[0]?.from).toBe("Ops <ops@notify.parmanasystems.com>");
  });

  it("reports a send error as a failure", async () => {
    const notifier = new EmailApprovalNeededNotifier(
      "f@x.test",
      ["a@x.test"],
      async () => ({
        error: "domain is not verified",
      }),
    );

    await expect(notifier.notify(event)).rejects.toThrow(
      /domain is not verified/,
    );
  });
});

describe("createApprovalNeededNotifier with both channels", () => {
  it("is undefined with neither, and a composite with both", () => {
    expect(createApprovalNeededNotifier({})).toBeUndefined();
    expect(
      createApprovalNeededNotifier({
        ...resend,
        APPROVAL_EMAIL_TO: "a@x.test",
        APPROVAL_WEBHOOK_URL: "https://hooks.x.test/h",
        APPROVAL_WEBHOOK_SECRET: "s",
      }),
    ).toBeInstanceOf(CompositeApprovalNeededNotifier);
  });

  it("tries every channel and reports each failure", async () => {
    const ok = { notify: vi.fn(async () => {}) };
    const failing = {
      notify: vi.fn(async () => {
        throw new Error("webhook down");
      }),
    };

    await expect(
      new CompositeApprovalNeededNotifier([failing, ok]).notify(event),
    ).rejects.toThrow(/webhook down/);
    expect(ok.notify).toHaveBeenCalledTimes(1);
  });
});

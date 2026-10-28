import { ExecutionRejectedError } from "@parmana/sdk";
import { describe, expect, it } from "vitest";

import type { AgentClient } from "../../razorpay-refund-agent/agent.js";
import { createMcpHandler } from "../mcp.js";

const TOKEN = "t".repeat(40);
const PAYMENT = "pay_TestPayment123";

/**
 * A fake Parmana: records the transactions it is sent, and refuses,
 * approves, or fails to answer (a timeout) as the test asks.
 */
function fakeParmana(options: { reject?: boolean; timeout?: boolean } = {}) {
  const executed: {
    businessTransactionId: string;
    intent: { target: string; parameters: unknown };
  }[] = [];

  const client = {
    async caller() {
      return { callerId: "razorpay-agent-studio" };
    },
    async policyInEffect() {
      return { policy: { name: "razorpay-refund", version: "1.0.0" } };
    },
    async execute(transaction: (typeof executed)[number]) {
      executed.push(transaction);

      if (options.timeout) {
        throw new Error("The request timed out.");
      }

      if (options.reject) {
        throw new ExecutionRejectedError("refused");
      }

      return {
        executions: [
          { evidence: { result: { refundId: "rfnd_1", amount: 100 } } },
        ],
      };
    },
    async refusalRecord() {
      return {
        decision: {
          matchedRuleId: "reject-manager-approval-required",
          reason: "no signed manager approval",
        },
      };
    },
  };

  return {
    client: client as unknown as AgentClient,
    executed,
  };
}

function rpc(method: string, params?: unknown, id: number | null = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function toolCall(args: Record<string, unknown>) {
  return rpc("tools/call", { name: "propose_refund", arguments: args });
}

const AUTH = `Bearer ${TOKEN}`;

describe("MCP endpoint authentication", () => {
  it("refuses a request without the Agent Studio token, calling nothing", async () => {
    const parmana = fakeParmana();
    const mcp = createMcpHandler({ token: TOKEN, client: parmana.client });

    expect((await mcp(undefined, rpc("tools/list"))).status).toBe(401);
    expect((await mcp("Bearer wrong", rpc("tools/list"))).status).toBe(401);
    expect(
      (
        await mcp(
          `Bearer ${TOKEN}x`,
          toolCall({ paymentId: PAYMENT, amountPaise: 100 }),
        )
      ).status,
    ).toBe(401);
    expect(parmana.executed).toHaveLength(0);
  });
});

describe("MCP protocol", () => {
  it("answers initialize, lists the one tool, and acknowledges notifications", async () => {
    const mcp = createMcpHandler({
      token: TOKEN,
      client: fakeParmana().client,
    });

    const init = await mcp(AUTH, rpc("initialize", {}));
    expect(init.status).toBe(200);
    expect(init.body).toMatchObject({
      result: { capabilities: { tools: {} } },
    });

    const list = await mcp(AUTH, rpc("tools/list"));
    expect(list.body).toMatchObject({
      result: { tools: [{ name: "propose_refund" }] },
    });

    const note = await mcp(AUTH, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(note.status).toBe(202);
  });

  it("answers an unknown method with a JSON-RPC error", async () => {
    const mcp = createMcpHandler({
      token: TOKEN,
      client: fakeParmana().client,
    });

    expect((await mcp(AUTH, rpc("resources/list"))).body).toMatchObject({
      error: { code: -32601 },
    });
  });
});

describe("propose_refund", () => {
  it("proposes the refund to Parmana, and reports the Razorpay answer when approved", async () => {
    const parmana = fakeParmana();
    const mcp = createMcpHandler({ token: TOKEN, client: parmana.client });

    const answer = await mcp(
      AUTH,
      toolCall({
        paymentId: PAYMENT,
        amountPaise: 100,
        approval: { approverId: "manager" },
      }),
    );

    expect(parmana.executed).toHaveLength(1);
    expect(parmana.executed[0]?.intent).toMatchObject({
      target: PAYMENT,
      parameters: { amount: 100 },
    });

    const text = (answer.body as { result: { content: { text: string }[] } })
      .result.content[0]?.text;
    expect(JSON.parse(text ?? "{}")).toMatchObject({
      status: "APPROVED",
      razorpay: { refundId: "rfnd_1" },
    });
  });

  it("reports a refusal with its rule, not as a server error", async () => {
    const mcp = createMcpHandler({
      token: TOKEN,
      client: fakeParmana({ reject: true }).client,
    });

    const answer = await mcp(
      AUTH,
      toolCall({ paymentId: PAYMENT, amountPaise: 100 }),
    );

    expect(answer.status).toBe(200);
    const text = (answer.body as { result: { content: { text: string }[] } })
      .result.content[0]?.text;
    expect(JSON.parse(text ?? "{}")).toMatchObject({
      status: "REFUSED",
      rule: "reject-manager-approval-required",
    });
  });

  it("reports a request that did not complete with its transaction id, and says not to retry", async () => {
    const parmana = fakeParmana({ timeout: true });
    const mcp = createMcpHandler({ token: TOKEN, client: parmana.client });

    const answer = await mcp(
      AUTH,
      toolCall({
        paymentId: PAYMENT,
        amountPaise: 100,
        approval: { approverId: "manager" },
      }),
    );

    expect(parmana.executed).toHaveLength(1);
    const transactionId = parmana.executed[0]?.businessTransactionId;
    expect(transactionId).toBeTruthy();

    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ result: { isError: true } });

    const text = (answer.body as { result: { content: { text: string }[] } })
      .result.content[0]?.text;
    const reported = JSON.parse(text ?? "{}");
    expect(reported).toMatchObject({
      status: "NOT_COMPLETED",
      businessTransactionId: transactionId,
    });
    expect(reported.message).toMatch(/Do not send it again/);
  });

  it("rejects bad input as a tool error, before calling Parmana", async () => {
    const parmana = fakeParmana();
    const mcp = createMcpHandler({ token: TOKEN, client: parmana.client });

    const answer = await mcp(
      AUTH,
      toolCall({ paymentId: "order_1", amountPaise: 100 }),
    );

    expect(answer.body).toMatchObject({ result: { isError: true } });
    expect(parmana.executed).toHaveLength(0);
  });
});

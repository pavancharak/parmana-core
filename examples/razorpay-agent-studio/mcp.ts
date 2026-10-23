/**
 * An MCP server for Razorpay Agent Studio. It exposes one tool,
 * propose_refund, which proposes a refund of a Razorpay payment to Parmana
 * (the real API) through the refund agent in examples/razorpay-refund-agent.
 * Parmana decides. When it releases, the endpoint in examples/razorpay-refund
 * refunds in Razorpay.
 *
 * Agent Studio calls this server over HTTPS with a bearer token that only
 * Agent Studio holds (AGENT_STUDIO_TOKEN). The server holds Parmana's agent
 * key (PARMANA_API_KEY) and no Razorpay credential.
 *
 * Protocol: MCP over streamable HTTP, JSON responses only. Methods:
 * initialize, ping, tools/list, tools/call.
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { ParmanaClient } from "@parmana/sdk";

import {
  type AgentClient,
  CAPABILITY,
  type RefundDecision,
  requestRefund,
  type RefundInput,
  validateRefundInput,
} from "../razorpay-refund-agent/agent.js";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "parmana-razorpay-refund", version: "1.0.0" };

export const TOOL = {
  name: "propose_refund",
  description:
    "Propose a refund of a Razorpay payment to Parmana, which decides whether it may be released. Amounts are in paise (100 is ₹1). Refused unless a manager's signed approval for this payment and amount is attached and the agent's grant covers the amount. Test mode only.",
  inputSchema: {
    type: "object",
    properties: {
      paymentId: {
        type: "string",
        pattern: "^pay_[A-Za-z0-9]{6,40}$",
        description: "The Razorpay payment id, pay_...",
      },
      amountPaise: {
        type: "integer",
        minimum: 1,
        description: "The refund amount in paise.",
      },
      purpose: {
        type: "string",
        description: "Why the refund is proposed, for the record.",
      },
      approval: {
        type: "object",
        description:
          "A manager's signed approval for this payment and amount, from the approval step. Omit it and Parmana refuses the request.",
      },
    },
    required: ["paymentId", "amountPaise"],
    additionalProperties: false,
  },
} as const;

export interface McpOptions {
  /** The bearer token Agent Studio must present. */
  readonly token: string;
  readonly client: AgentClient;
}

export interface McpAnswer {
  readonly status: number;
  readonly body?: unknown;
}

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

function rpcError(id: JsonRpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function rpcResult(id: JsonRpc["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function summarize(decision: RefundDecision): Record<string, unknown> {
  if (decision.status === "REFUSED") {
    return {
      status: "REFUSED",
      businessTransactionId: decision.businessTransactionId,
      rule: decision.rule,
      reason: decision.reason,
    };
  }

  const evidence = decision.record.executions[0]?.evidence as
    { result?: Record<string, unknown> } | undefined;

  return {
    status: "APPROVED",
    businessTransactionId: decision.businessTransactionId,
    razorpay: evidence?.result ?? null,
  };
}

async function callTool(client: AgentClient, params: Record<string, unknown>) {
  if (params.name !== TOOL.name) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${String(params.name)}` }],
      isError: true,
    };
  }

  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const input: RefundInput = {
    paymentId: String(args.paymentId ?? ""),
    amountPaise: args.amountPaise as number,
    ...(typeof args.purpose === "string" ? { purpose: args.purpose } : {}),
    ...(args.approval !== undefined ? { approval: args.approval } : {}),
  };

  try {
    validateRefundInput(input);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : String(error),
        },
      ],
      isError: true,
    };
  }

  const decision = await requestRefund(client, {
    ...input,
    purpose: input.purpose ?? `Agent Studio refund proposal (${CAPABILITY})`,
  });

  return {
    content: [
      { type: "text", text: JSON.stringify(summarize(decision), null, 2) },
    ],
  };
}

async function dispatch(
  client: AgentClient,
  message: JsonRpc,
): Promise<unknown | undefined> {
  const params = message.params ?? {};

  switch (message.method) {
    case "initialize":
      return rpcResult(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return rpcResult(message.id, {});
    case "tools/list":
      return rpcResult(message.id, { tools: [TOOL] });
    case "tools/call":
      return rpcResult(message.id, await callTool(client, params));
    default:
      if (message.id === undefined) {
        // A notification (for example notifications/initialized): no reply.
        return undefined;
      }

      return rpcError(message.id, -32601, `Unknown method: ${message.method}`);
  }
}

/** Authenticates and answers one MCP request. */
export function createMcpHandler(options: McpOptions) {
  return async (
    authorization: string | undefined,
    body: unknown,
  ): Promise<McpAnswer> => {
    if (
      authorization === undefined ||
      !same(authorization, `Bearer ${options.token}`)
    ) {
      return { status: 401, body: { error: "unauthorized" } };
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return {
        status: 400,
        body: rpcError(null, -32600, "Expected one JSON-RPC message."),
      };
    }

    const reply = await dispatch(options.client, body as JsonRpc);

    if (reply === undefined) {
      return { status: 202 };
    }

    return { status: 200, body: reply };
  };
}

let handle: ReturnType<typeof createMcpHandler> | undefined;

function handler(): ReturnType<typeof createMcpHandler> {
  if (handle === undefined) {
    const token = process.env.AGENT_STUDIO_TOKEN?.trim() ?? "";

    if (token.length < 32) {
      throw new Error(
        "AGENT_STUDIO_TOKEN must be set (32 characters or more).",
      );
    }

    const client = new ParmanaClient({
      endpoint: (process.env.PARMANA_URL ?? "").replace(/\/+$/, ""),
      apiKey: process.env.PARMANA_API_KEY?.trim() ?? "",
      timeout: 120_000,
    });

    handle = createMcpHandler({ token, client });
  }

  return handle;
}

export default async function vercelHandler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(405).end();
    return;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }

  let body: unknown;

  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    response
      .writeHead(400, { "Content-Type": "application/json" })
      .end(JSON.stringify(rpcError(null, -32700, "Parse error.")));
    return;
  }

  let answer: McpAnswer;

  try {
    answer = await handler()(request.headers.authorization, body);
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "mcp_error",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    answer = {
      status: 500,
      body: rpcError(null, -32603, "The refund proposal did not complete."),
    };
  }

  if (answer.body === undefined) {
    response.writeHead(answer.status).end();
    return;
  }

  response
    .writeHead(answer.status, { "Content-Type": "application/json" })
    .end(JSON.stringify(answer.body));
}

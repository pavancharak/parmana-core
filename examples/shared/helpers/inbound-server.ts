/**
 * Shared server for the RFC-0025 inbound refund examples.
 *
 * Mounts the real inbound decision and outcome routers from packages/api, with in-memory stores
 * and a generated Ed25519 key, so each example runs without a database or a running API server.
 *
 * The x-partner-id header stands in for caller authentication. In production, caller auth sets
 * the partner's callerId from its API key before these routes run.
 */
import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import type { NextFunction, Request, Response } from "express";

import type { AuthorityGrant } from "@parmana/shared";

import {
  canonicalDecisionBytes,
  createInboundDecisionRouter,
  type InboundDecisionFields,
} from "../../../packages/api/src/routes/inbound-decisions.js";
import {
  createInboundOutcomeRouter,
  type InboundOutcomeRecord,
} from "../../../packages/api/src/routes/inbound-outcomes.js";

/** The audience every decision is issued for. A partner must reject a decision for another audience. */
export const AUDIENCE = "refunds.example";

/** A decision as Parmana returns it: the signed fields plus the signature. */
export type IssuedDecision = InboundDecisionFields & {
  readonly signature: string;
};

export interface InboundServer {
  readonly url: string;
  readonly publicKey: KeyObject;
  readonly decisions: Map<string, IssuedDecision>;
  readonly outcomes: Map<string, InboundOutcomeRecord>;
  close(): void;
}

export interface JsonResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/**
 * Checks a decision's signature with Parmana's public key. The signature covers every field
 * except itself, so changing any field after issue makes this return false.
 */
export function verifyDecision(
  publicKey: KeyObject,
  decision: IssuedDecision,
): boolean {
  const { signature, ...fields } = decision;

  return verify(
    null,
    canonicalDecisionBytes(fields),
    publicKey,
    Buffer.from(signature, "base64"),
  );
}

/**
 * Starts the inbound routes on a free local port.
 *
 * @param limits Partner id to the INR limit of that partner's inbound:refund grant. A partner
 *   not listed here has no grant.
 */
export async function startInboundServer(
  limits: Readonly<Record<string, number>>,
): Promise<InboundServer> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  const grants = new Map<string, AuthorityGrant>();

  for (const [partnerId, limit] of Object.entries(limits)) {
    grants.set(partnerId, {
      grantId: `grant-${partnerId}`,
      callerId: partnerId,
      capability: "inbound:refund",
      limits: { "parameters.amountInr": { max: limit } },
      validFrom: new Date(Date.now() - 60_000),
      validUntil: new Date(Date.now() + 86_400_000),
      status: "active",
      grantedAt: new Date(),
    } as AuthorityGrant);
  }

  const decisions = new Map<string, IssuedDecision>();
  const outcomes = new Map<string, InboundOutcomeRecord>();

  const app = express();
  app.use(express.json());
  app.use(callerFromHeader);

  app.use(
    "/v1/inbound/decisions",
    createInboundDecisionRouter({
      audience: AUDIENCE,
      findGrant: async (partnerId) => grants.get(partnerId) ?? null,
      sign: async (bytes) => sign(null, bytes, privateKey).toString("base64"),
      store: {
        append: async (record) => {
          decisions.set(record.decisionId, record as IssuedDecision);
        },
      },
    }),
  );

  app.use(
    "/v1/inbound/outcomes",
    createInboundOutcomeRouter({
      findDecision: async (decisionId) => {
        const decision = decisions.get(decisionId);

        return decision
          ? {
              decisionId: decision.decisionId,
              partnerId: decision.partnerId,
              paymentId: decision.paymentId,
              limitInr: decision.limitInr,
            }
          : null;
      },
      store: {
        append: async (record) => {
          if (outcomes.has(record.decisionId)) return false;

          outcomes.set(record.decisionId, record);

          return true;
        },
      },
    }),
  );

  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    publicKey,
    decisions,
    outcomes,
    close: () => server.close(),
  };
}

/** Sends a JSON POST, with x-partner-id set when a partner id is given. */
export async function postJson(
  url: string,
  path: string,
  body: unknown,
  partnerId?: string,
): Promise<JsonResponse> {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(partnerId ? { "x-partner-id": partnerId } : {}),
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

/** Stands in for caller auth: sets callerId from the x-partner-id header. */
function callerFromHeader(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const partnerId = req.get("x-partner-id");

  if (partnerId) {
    (req as Request & { callerId?: string }).callerId = partnerId;
  }

  next();
}

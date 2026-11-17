import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import type {
  NeutralDeliveryEvent,
  PolicyV2EventService,
} from "../policyV2/policyV2Bounces.js";
import {
  EVENTS_SIGNATURE_HEADER,
  verifyEventsSignature,
} from "../policyV2/policyV2EventsAuth.js";

/**
 * POST /v2/notifications/events (policy version 2)
 *
 * Any mail provider's adapter posts delivery events here, in one neutral form, signed with an HMAC
 * over the raw body. Send the body as text/plain, so the raw bytes are kept for the signature. A
 * request that does not verify gets 403. The endpoint sits outside caller authentication.
 */

export interface PolicyV2EventsEndpoint {
  readonly service: PolicyV2EventService;
  readonly secret: string;
}

const TYPES = ["bounce", "complaint", "delivery"] as const;

/** Checks the shape of each event. Returns undefined if any event is malformed. */
export function parseNeutralEvents(
  raw: string,
): NeutralDeliveryEvent[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const events = (parsed as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return undefined;
  const out: NeutralDeliveryEvent[] = [];
  for (const item of events) {
    const e = item as Record<string, unknown>;
    if (typeof e !== "object" || e === null) return undefined;
    if (typeof e.eventId !== "string" || e.eventId === "") return undefined;
    if (!TYPES.includes(e.type as (typeof TYPES)[number])) return undefined;
    if (typeof e.messageId !== "string" || e.messageId === "") return undefined;
    if (typeof e.recipient !== "string" || !e.recipient.includes("@"))
      return undefined;
    if (
      e.bounceKind !== undefined &&
      e.bounceKind !== "permanent" &&
      e.bounceKind !== "transient"
    )
      return undefined;
    out.push({
      eventId: e.eventId,
      type: e.type as NeutralDeliveryEvent["type"],
      messageId: e.messageId,
      recipient: e.recipient,
      ...(e.bounceKind !== undefined
        ? { bounceKind: e.bounceKind as "permanent" | "transient" }
        : {}),
    });
  }
  return out;
}

export function createPolicyV2EventsRouter(
  endpoint: PolicyV2EventsEndpoint,
): Router {
  const router = Router();

  router.post(
    "/",
    express.text({ type: "*/*", limit: "256kb" }),
    async (req: Request, res: Response, next: NextFunction) => {
      const raw = typeof req.body === "string" ? req.body : "";
      const header = req.header(EVENTS_SIGNATURE_HEADER) ?? "";
      if (!verifyEventsSignature(raw, header, endpoint.secret)) {
        res.status(403).json({ error: "not_verified" });
        return;
      }
      const events = parseNeutralEvents(raw);
      if (events === undefined) {
        res.status(400).json({
          error: "invalid_request",
          message:
            "events must be a list of { eventId, type, messageId, recipient, bounceKind? }.",
        });
        return;
      }
      try {
        res
          .status(200)
          .json({ recorded: await endpoint.service.handle(events) });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

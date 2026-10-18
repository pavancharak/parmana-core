import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

import type { HubSpotDeal, HubSpotDealProperties } from "./HubSpotTypes.js";

export interface MockHubSpotServerOptions {
  readonly token: string;
}

/**
 * Local, in-memory stand-in for HubSpot's CRM Objects API (Deals only),
 * hermetic and deterministic. Never makes or receives real network
 * traffic beyond localhost.
 *
 * Behavior is deliberately conservative and matches only what this
 * milestone's spec states about HubSpot: GET
 * /crm/v3/objects/deals/:id(?properties=...) and PATCH
 * /crm/v3/objects/deals/:id. Anything not stated by the spec (Contacts,
 * Companies, delete/archive, webhooks, multi-object transactions) is out
 * of scope and not simulated here.
 */
export class MockHubSpotServer {
  private server: Server | undefined;
  private baseUrlValue = "";
  private readonly deals = new Map<string, HubSpotDeal>();
  private responseDelayMs = 0;

  constructor(private readonly options: MockHubSpotServerOptions) {}

  get baseUrl(): string {
    return this.baseUrlValue;
  }

  /** Test-only hook: delays every response, used to exercise connector timeout handling. */
  setResponseDelayMs(delayMs: number): void {
    this.responseDelayMs = delayMs;
  }

  setDeal(deal: HubSpotDeal): void {
    this.deals.set(deal.id, deal);
  }

  getDeal(dealId: string): HubSpotDeal | undefined {
    return this.deals.get(dealId);
  }

  async listen(): Promise<void> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "error",
            message: error instanceof Error ? error.message : "unknown error",
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve),
    );
    const address = this.server!.address() as AddressInfo;
    this.baseUrlValue = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    if (this.server === undefined) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  private async handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!this.authenticates(req)) {
      this.respond(res, 401, {
        status: "error",
        category: "INVALID_AUTHENTICATION",
        message:
          "Authentication credentials not found. This API supports OAuth 2.0 authentication.",
      });
      return;
    }

    const url = req.url ?? "";
    const method = req.method ?? "GET";
    const path = url.split("?")[0] ?? url;

    const dealMatch = /^\/crm\/v3\/objects\/deals\/([^/]+)$/.exec(path);

    if (method === "GET" && dealMatch) {
      this.handleFetchDeal(res, decodeURIComponent(dealMatch[1]!));
      return;
    }

    if (method === "PATCH" && dealMatch) {
      const body = await this.readJsonBody(req);
      this.handleUpdateDeal(res, decodeURIComponent(dealMatch[1]!), body);
      return;
    }

    this.respond(res, 404, {
      status: "error",
      category: "OBJECT_NOT_FOUND",
      message: "Not found",
    });
  }

  private handleFetchDeal(res: ServerResponse, dealId: string): void {
    const deal = this.deals.get(dealId);
    if (deal === undefined) {
      this.respond(res, 404, {
        status: "error",
        category: "OBJECT_NOT_FOUND",
        message: `No deal found with id ${dealId}`,
      });
      return;
    }
    this.respond(res, 200, deal);
  }

  private handleUpdateDeal(
    res: ServerResponse,
    dealId: string,
    body: Record<string, unknown>,
  ): void {
    const deal = this.deals.get(dealId);
    if (deal === undefined) {
      this.respond(res, 404, {
        status: "error",
        category: "OBJECT_NOT_FOUND",
        message: `No deal found with id ${dealId}`,
      });
      return;
    }

    const incomingProperties =
      (body.properties as HubSpotDealProperties | undefined) ?? {};
    const updated: HubSpotDeal = {
      ...deal,
      properties: { ...deal.properties, ...incomingProperties },
    };

    this.deals.set(dealId, updated);
    this.respond(res, 200, updated);
  }

  private authenticates(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) return false;
    return header.slice("Bearer ".length) === this.options.token;
  }

  private async readJsonBody(
    req: IncomingMessage,
  ): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw.length === 0) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private respond(res: ServerResponse, status: number, body: unknown): void {
    setTimeout(() => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }, this.responseDelayMs);
  }
}

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export interface MockSlackServerOptions {
  readonly botToken: string;
}

interface ReceivedRequest {
  readonly channel: unknown;
  readonly text: unknown;
}

/**
 * Local, in-memory stand-in for Slack's real Web API
 * (https://slack.com/api/chat.postMessage). Hermetic and deterministic
 * -- never makes or receives real network traffic beyond localhost, and
 * never talks to Slack's real endpoint. GatewaySlackAdapter's own tests
 * and the connect-an-agent/Slack-connector tutorials point a baseUrl
 * override at this server instead of https://slack.com.
 *
 * Mirrors Slack's real, documented quirk: every response is HTTP 200,
 * even a failure. Success/failure is signaled only by the JSON body's
 * `ok` field plus an `error` string -- see SlackTypes.ts's
 * SlackPostMessageResponse for why GatewaySlackAdapter must check `ok`,
 * not just the HTTP status.
 */
export class MockSlackServer {
  private server: Server | undefined;
  private baseUrlValue = "";
  private responseDelayMs = 0;
  private forcedError: string | undefined;
  private forcedHttpStatus: number | undefined;
  private readonly receivedRequests: ReceivedRequest[] = [];

  constructor(private readonly options: MockSlackServerOptions) {}

  get baseUrl(): string {
    return this.baseUrlValue;
  }

  get calls(): readonly ReceivedRequest[] {
    return this.receivedRequests;
  }

  /** Test-only hook: delays every response, used to exercise the connector's own timeout handling. */
  setResponseDelayMs(delayMs: number): void {
    this.responseDelayMs = delayMs;
  }

  /** Forces the next response to report ok:false with this Slack error code (e.g. "channel_not_found"). */
  setForcedError(error: string | undefined): void {
    this.forcedError = error;
  }

  /** Forces a non-2xx HTTP response, simulating a transport-level failure (Slack itself almost never does this). */
  setForcedHttpStatus(status: number | undefined): void {
    this.forcedHttpStatus = status;
  }

  async listen(): Promise<void> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        this.respond(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "request failed",
        });
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
      // Slack's real API answers an invalid token with HTTP 200,
      // {ok: false, error: "invalid_auth"} -- not a 401. Mirrored here.
      this.respond(res, 200, { ok: false, error: "invalid_auth" });
      return;
    }

    const url = req.url ?? "";
    const path = url.split("?")[0] ?? url;

    if (req.method !== "POST" || path !== "/api/chat.postMessage") {
      this.respond(res, 404, { ok: false, error: "not_found" });
      return;
    }

    if (this.forcedHttpStatus !== undefined) {
      this.respond(res, this.forcedHttpStatus, {
        ok: false,
        error: "forced_failure",
      });
      return;
    }

    const body = await this.readJsonBody(req);
    this.receivedRequests.push({ channel: body.channel, text: body.text });

    if (this.forcedError !== undefined) {
      this.respond(res, 200, { ok: false, error: this.forcedError });
      return;
    }

    if (typeof body.channel !== "string" || body.channel.length === 0) {
      this.respond(res, 200, { ok: false, error: "channel_not_found" });
      return;
    }
    if (typeof body.text !== "string" || body.text.length === 0) {
      this.respond(res, 200, { ok: false, error: "no_text" });
      return;
    }

    this.respond(res, 200, {
      ok: true,
      channel: body.channel,
      ts: `${Math.floor(Date.now() / 1000)}.000100`,
    });
  }

  private authenticates(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) return false;
    return header.slice("Bearer ".length) === this.options.botToken;
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

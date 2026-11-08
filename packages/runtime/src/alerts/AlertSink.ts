import { createHmac } from "node:crypto";

/**
 * Alerts for the events a deployer must be able to monitor (G-138):
 * decisions (approved or refused) and kill switch trips.
 *
 * Payloads carry identifiers, outcomes, reasons and timestamps only.
 * They never carry Intent parameters, signals or artifacts, so an alert
 * destination never receives business data it was not meant to hold.
 *
 * Delivery is best-effort and never blocks the action being reported.
 * emit() never rejects: a failed delivery is reported in its result and
 * is never thrown into the Runtime or the kill switch.
 */

export type AlertEvent =
  | {
      readonly type: "decision.approved" | "decision.refused";
      readonly occurredAt: string;
      readonly businessTransactionId: string;
      readonly decisionId: string;
      readonly policyName: string;
      readonly policyVersion: string;
      readonly submittedBy?: string | undefined;
      readonly reason?: string | undefined;
    }
  | {
      readonly type: "killswitch.tripped";
      readonly occurredAt: string;
      readonly trippedBy: string;
      readonly reason: string;
      readonly switchVersion: number;
    };

export interface AlertDeliveryResult {
  readonly delivered: boolean;
  readonly attempts: number;
  readonly error?: string | undefined;
}

export interface AlertSink {
  emit(event: AlertEvent): Promise<AlertDeliveryResult>;
}

/** Keeps every event in memory. For tests and local development. */
export class MemoryAlertSink implements AlertSink {
  readonly events: AlertEvent[] = [];

  async emit(event: AlertEvent): Promise<AlertDeliveryResult> {
    this.events.push(event);
    return { delivered: true, attempts: 1 };
  }
}

export interface WebhookAlertSinkOptions {
  /** https:// in production. http:// is accepted only for loopback, for local tests. */
  readonly url: string;
  /** When set, each body is signed as `X-Parmana-Signature: sha256=<hex HMAC>`. */
  readonly secret?: string | undefined;
  readonly maxAttempts?: number | undefined;
  readonly timeoutMs?: number | undefined;
  readonly retryDelayMs?: number | undefined;
  /** Injected for tests. Defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch | undefined;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Throws at construction when the URL is not safe to send alerts to.
 * Alerts name businesses, decisions and operators, so plain http to a
 * remote host is refused, the same rule the connector base URLs follow.
 */
export function assertAlertUrl(url: string): void {
  const parsed = new URL(url);

  if (parsed.protocol === "https:") return;

  if (parsed.protocol === "http:" && LOOPBACK.has(parsed.hostname)) return;

  throw new Error(
    "Alert webhook URL must use https:// (http:// is allowed only for localhost).",
  );
}

export class WebhookAlertSink implements AlertSink {
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: WebhookAlertSinkOptions) {
    assertAlertUrl(options.url);
    this.maxAttempts = options.maxAttempts ?? 3;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.retryDelayMs = options.retryDelayMs ?? 500;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async emit(event: AlertEvent): Promise<AlertDeliveryResult> {
    const body = JSON.stringify({ schema: "parmana.alert.v1", ...event });
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };

    if (this.options.secret !== undefined) {
      const mac = createHmac("sha256", this.options.secret)
        .update(body)
        .digest("hex");
      headers["x-parmana-signature"] = `sha256=${mac}`;
    }

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await this.fetchImpl(this.options.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });

        if (response.ok) {
          return { delivered: true, attempts: attempt };
        }

        // 4xx (other than 429) means the receiver rejected this alert. Retrying will not help.
        const retryable = response.status >= 500 || response.status === 429;
        lastError = `HTTP ${response.status}`;

        if (!retryable) {
          return { delivered: false, attempts: attempt, error: lastError };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt < this.maxAttempts && this.retryDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)),
        );
      }
    }

    return { delivered: false, attempts: this.maxAttempts, error: lastError };
  }
}

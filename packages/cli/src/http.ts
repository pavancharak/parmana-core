import { CliFailure } from "./errors.js";
import { redactText } from "./redact.js";

export interface HttpRuntime {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
  readonly log: (line: string) => void;
}

export interface RequestSpec {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: string;
}

export interface Target {
  readonly baseUrl: string;
  readonly token: string;
  readonly timeoutMs: number;
  readonly verbose: boolean;
}

export interface BuiltRequest {
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | undefined;
}

export interface SentResponse {
  readonly status: number;
  readonly body: string;
}

/** Statuses that mean "try again later". Only reads are retried. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const READ_ATTEMPTS = 3;

export function buildRequest(target: Target, spec: RequestSpec): BuiltRequest {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${target.token}`,
  };
  if (spec.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  return {
    method: spec.method,
    url: `${target.baseUrl}${spec.path}`,
    headers,
    body: spec.body,
  };
}

/** The request as it may be printed: the token and any signature are masked. */
export function displayRequest(
  request: BuiltRequest,
  secrets: readonly string[],
): string {
  const lines = [
    `${request.method} ${request.url}`,
    "Authorization: Bearer ***",
  ];
  if (request.body !== undefined) {
    lines.push("", redactText(request.body, secrets));
  }
  return lines.join("\n");
}

function backoffMs(attempt: number): number {
  return 250 * 2 ** attempt;
}

/**
 * Sends one request. A GET is retried on network errors and on 429/502/503/504,
 * with a short backoff. A POST is never retried: a repeated approval could reuse
 * a spent envelope, and a repeated proposal would be refused as a conflict anyway.
 */
export async function send(
  target: Target,
  spec: RequestSpec,
  runtime: HttpRuntime,
): Promise<SentResponse> {
  const request = buildRequest(target, spec);
  const attempts = spec.method === "GET" ? READ_ATTEMPTS : 1;
  const safeUrl = redactText(request.url, [target.token]);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const started = Date.now();
    if (target.verbose) {
      runtime.log(
        `-> ${spec.method} ${safeUrl}${attempt > 0 ? ` (attempt ${attempt + 1})` : ""}`,
      );
    }
    try {
      const response = await runtime.fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body !== undefined ? { body: request.body } : {}),
        signal: AbortSignal.timeout(target.timeoutMs),
      });
      const body = await response.text();
      if (target.verbose) {
        runtime.log(`<- ${response.status} (${Date.now() - started} ms)`);
      }
      if (RETRYABLE_STATUS.has(response.status) && attempt < attempts - 1) {
        await runtime.sleep(backoffMs(attempt));
        continue;
      }
      return { status: response.status, body };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (attempt < attempts - 1) {
        await runtime.sleep(backoffMs(attempt));
        continue;
      }
      throw new CliFailure(
        redactText(
          `Could not reach ${target.baseUrl}: ${reason}. Check the network and PARMANA_API_URL.`,
          [target.token],
        ),
      );
    }
  }
  throw new CliFailure("The request did not complete.");
}

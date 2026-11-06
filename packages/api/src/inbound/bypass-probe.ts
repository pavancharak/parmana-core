/**
 * No-bypass probe (RFC-0024 decision 6, gap G-146).
 *
 * A business system is protected against direct agent calls only if it refuses a request that
 * carries no Parmana approval. This probe sends such a request to a configured business-system
 * route and checks that the route refuses it. The result is recorded as a signed record whatever
 * it is, and a request that gets through raises an alert.
 *
 * Outcomes:
 *   refused       the route answered 401 or 403. The protection held for this route.
 *   bypass        the route accepted the request (any 2xx or 3xx). Alert. Protection failed.
 *   not_verified  no answer, or an answer that is neither a refusal nor an acceptance (for example
 *                 404 or 500). The probe cannot say the route is protected, so it does not say so.
 *
 * The probe sends no credential and no approval. It sends to exactly the URL it is given, never
 * follows a redirect, and only uses https targets.
 */

export interface BypassProbeTarget {
  /** A short name for the route, shown in records and alerts. */
  readonly name: string;
  /** The business-system route an external agent would call. Must be https. */
  readonly url: string;
  readonly method: "GET" | "POST";
  /** Optional JSON body for POST. The probe sends no approval with it. */
  readonly body?: string;
}

export type BypassProbeOutcome = "refused" | "bypass" | "not_verified";

export interface BypassProbeRecord {
  readonly probeId: string;
  readonly targetName: string;
  readonly targetUrl: string;
  readonly probedAt: string;
  readonly outcome: BypassProbeOutcome;
  readonly status?: number;
  readonly reason: string;
}

export interface BypassProbeDependencies {
  /** The request function. Injected so tests and production use the same code path. */
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Signs the canonical bytes of a record, returning a base64 signature. */
  readonly sign: (canonicalBytes: Buffer) => Promise<string>;
  /** Appends every record. */
  readonly log: {
    record(record: BypassProbeRecord & { signature: string }): Promise<void>;
  };
  /** Called for every bypass. Must not throw into the probe; errors are reported by the caller. */
  readonly alert: (record: BypassProbeRecord) => Promise<void>;
  readonly newId: () => string;
  readonly now?: () => Date;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Maps an HTTP status to an outcome. Only 401 and 403 count as a refusal. */
export function classifyBypassStatus(status: number): BypassProbeOutcome {
  if (status === 401 || status === 403) return "refused";
  if (status >= 200 && status < 400) return "bypass";
  return "not_verified";
}

/** Runs one probe, records it, and alerts on a bypass. Returns the signed record. */
export async function runBypassProbe(
  target: BypassProbeTarget,
  deps: BypassProbeDependencies,
): Promise<BypassProbeRecord & { signature: string }> {
  validateTarget(target);
  const now = deps.now ?? (() => new Date());
  const probedAt = now().toISOString();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (target.body !== undefined) headers["Content-Type"] = "application/json";

  let outcome: BypassProbeOutcome;
  let status: number | undefined;
  let reason: string;
  try {
    const response = await deps.fetch(target.url, {
      method: target.method,
      headers,
      body: target.body ?? null,
      redirect: "error",
      signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    status = response.status;
    await response.body?.cancel();
    outcome = classifyBypassStatus(status);
    reason =
      outcome === "refused"
        ? `route refused the request with ${status}`
        : outcome === "bypass"
          ? `route accepted a request with no approval (${status})`
          : `route answered ${status}, which is neither a refusal nor an acceptance`;
  } catch {
    outcome = "not_verified";
    reason =
      "no answer from the route, or the request was redirected; protection not verified";
  }

  const base: BypassProbeRecord = {
    probeId: deps.newId(),
    targetName: target.name,
    targetUrl: target.url,
    probedAt,
    outcome,
    ...(status !== undefined ? { status } : {}),
    reason,
  };
  const signature = await deps.sign(canonicalProbeBytes(base));
  const signed = { ...base, signature };
  await deps.log.record(signed);
  if (outcome === "bypass") await deps.alert(base);
  return signed;
}

/** Canonical JSON of a record: keys sorted at the top level, every field except the signature. */
export function canonicalProbeBytes(record: BypassProbeRecord): Buffer {
  const keys = Object.keys(record)
    .filter((k) => k !== "signature")
    .sort();
  const ordered: Record<string, unknown> = {};
  for (const k of keys)
    ordered[k] = (record as unknown as Record<string, unknown>)[k];
  return Buffer.from(JSON.stringify(ordered), "utf8");
}

function validateTarget(target: BypassProbeTarget): void {
  let url: URL;
  try {
    url = new URL(target.url);
  } catch {
    throw new Error(
      `bypass probe target "${target.name}" is not an absolute URL`,
    );
  }
  if (url.protocol !== "https:") {
    throw new Error(`bypass probe target "${target.name}" must use https`);
  }
  if (target.method !== "GET" && target.method !== "POST") {
    throw new Error(
      `bypass probe target "${target.name}" must use GET or POST`,
    );
  }
}

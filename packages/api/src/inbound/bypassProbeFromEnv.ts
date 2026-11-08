import { createPrivateKey, randomUUID, sign } from "node:crypto";

import {
  runBypassProbe,
  type BypassProbeRecord,
  type BypassProbeTarget,
} from "./bypass-probe.js";

/**
 * Configures and runs the no-bypass probe (RFC-0024 decision 6, gap G-146) from environment variables.
 *
 * With no target configured it does nothing and says so, so a scheduled run is harmless until a business
 * system names a route. A target without a signing key is a configuration error, because the probe must sign
 * every record it writes.
 */

export interface BypassProbeEnv {
  readonly BYPASS_PROBE_TARGET_URL?: string | undefined;
  readonly BYPASS_PROBE_TARGET_NAME?: string | undefined;
  readonly BYPASS_PROBE_METHOD?: string | undefined;
  readonly BYPASS_PROBE_BODY?: string | undefined;
  readonly BYPASS_PROBE_SIGNING_KEY_PEM?: string | undefined;
}

export type BypassProbeEnvResult =
  | { readonly kind: "not-configured"; readonly message: string }
  | { readonly kind: "config-error"; readonly message: string }
  | {
      readonly kind: "ran";
      readonly record: BypassProbeRecord & { readonly signature: string };
      /** True when the route accepted a request that carried no approval. */
      readonly bypass: boolean;
    };

export interface BypassProbeEnvDependencies {
  readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  readonly now?: () => Date;
}

export function targetFromEnv(
  env: BypassProbeEnv,
): BypassProbeTarget | undefined {
  const url = env.BYPASS_PROBE_TARGET_URL?.trim();
  if (url === undefined || url === "") return undefined;
  const method = (env.BYPASS_PROBE_METHOD ?? "GET").trim().toUpperCase();
  if (method !== "GET" && method !== "POST") {
    throw new Error("BYPASS_PROBE_METHOD must be GET or POST.");
  }
  const body =
    env.BYPASS_PROBE_BODY === undefined || env.BYPASS_PROBE_BODY === ""
      ? undefined
      : env.BYPASS_PROBE_BODY;
  return {
    name:
      (env.BYPASS_PROBE_TARGET_NAME ?? "business-route").trim() ||
      "business-route",
    url,
    method,
    ...(body !== undefined ? { body } : {}),
  };
}

export async function runBypassProbeFromEnv(
  env: BypassProbeEnv,
  deps: BypassProbeEnvDependencies = {},
): Promise<BypassProbeEnvResult> {
  let target: BypassProbeTarget | undefined;
  try {
    target = targetFromEnv(env);
  } catch (error) {
    return {
      kind: "config-error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (target === undefined) {
    return {
      kind: "not-configured",
      message:
        "No business-system route is configured (BYPASS_PROBE_TARGET_URL). Nothing was probed.",
    };
  }

  const pem = env.BYPASS_PROBE_SIGNING_KEY_PEM;
  if (pem === undefined || pem.trim() === "") {
    return {
      kind: "config-error",
      message:
        "BYPASS_PROBE_SIGNING_KEY_PEM is required: every probe record must be signed.",
    };
  }

  let key: ReturnType<typeof createPrivateKey>;
  try {
    key = createPrivateKey(pem);
  } catch {
    return {
      kind: "config-error",
      message: "BYPASS_PROBE_SIGNING_KEY_PEM is not a valid private key.",
    };
  }

  try {
    const record = await runBypassProbe(target, {
      fetch: deps.fetch ?? ((url, init) => fetch(url, init)),
      sign: async (bytes) => sign(null, bytes, key).toString("base64"),
      log: { record: async () => undefined },
      alert: async () => undefined,
      newId: () => randomUUID(),
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    });
    return { kind: "ran", record, bypass: record.outcome === "bypass" };
  } catch (error) {
    return {
      kind: "config-error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

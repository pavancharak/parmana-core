import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalProbeBytes } from "../../../src/inbound/bypass-probe.js";
import { runBypassProbeFromEnv } from "../../../src/inbound/bypassProbeFromEnv.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function fetchReturning(status: number) {
  return async () => new Response(null, { status });
}

describe("runBypassProbeFromEnv (G-146)", () => {
  it("does nothing and says so when no route is configured", async () => {
    const result = await runBypassProbeFromEnv({
      BYPASS_PROBE_SIGNING_KEY_PEM: PEM,
    });
    expect(result.kind).toBe("not-configured");
  });

  it("refuses to run without a signing key, because every record must be signed", async () => {
    const result = await runBypassProbeFromEnv({
      BYPASS_PROBE_TARGET_URL: "https://route.example.com/x",
    });
    expect(result.kind).toBe("config-error");
  });

  it("rejects an invalid signing key", async () => {
    const result = await runBypassProbeFromEnv({
      BYPASS_PROBE_TARGET_URL: "https://route.example.com/x",
      BYPASS_PROBE_SIGNING_KEY_PEM: "not a key",
    });
    expect(result.kind).toBe("config-error");
  });

  it("records a refusal, signed so that the signature verifies against the public key", async () => {
    const result = await runBypassProbeFromEnv(
      {
        BYPASS_PROBE_TARGET_URL: "https://route.example.com/x",
        BYPASS_PROBE_SIGNING_KEY_PEM: PEM,
      },
      { fetch: fetchReturning(403) },
    );
    expect(result.kind).toBe("ran");
    if (result.kind !== "ran") return;
    expect(result.record.outcome).toBe("refused");
    expect(result.bypass).toBe(false);
    const ok = verify(
      null,
      canonicalProbeBytes(result.record),
      publicKey,
      Buffer.from(result.record.signature, "base64"),
    );
    expect(ok).toBe(true);
  });

  it("flags a bypass when the route accepts a request with no approval", async () => {
    const result = await runBypassProbeFromEnv(
      {
        BYPASS_PROBE_TARGET_URL: "https://route.example.com/x",
        BYPASS_PROBE_SIGNING_KEY_PEM: PEM,
      },
      { fetch: fetchReturning(200) },
    );
    expect(result.kind).toBe("ran");
    if (result.kind !== "ran") return;
    expect(result.record.outcome).toBe("bypass");
    expect(result.bypass).toBe(true);
  });

  it("treats an unexpected status as not verified, not as protection", async () => {
    const result = await runBypassProbeFromEnv(
      {
        BYPASS_PROBE_TARGET_URL: "https://route.example.com/x",
        BYPASS_PROBE_SIGNING_KEY_PEM: PEM,
      },
      { fetch: fetchReturning(404) },
    );
    expect(result.kind === "ran" && result.record.outcome).toBe("not_verified");
  });

  it("rejects a method other than GET or POST", async () => {
    const result = await runBypassProbeFromEnv({
      BYPASS_PROBE_TARGET_URL: "https://route.example.com/x",
      BYPASS_PROBE_SIGNING_KEY_PEM: PEM,
      BYPASS_PROBE_METHOD: "DELETE",
    });
    expect(result.kind).toBe("config-error");
  });
});

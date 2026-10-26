import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  kiteAuthorizationHeader,
  kiteChecksum,
  kiteLoginUrl,
  ZERODHA_PLACE_ORDER_CAPABILITY,
  ZerodhaMetadata,
} from "../../src/index.js";

describe("kiteLoginUrl", () => {
  it("builds the login URL with v=3 and the api_key", () => {
    const url = new URL(kiteLoginUrl("abc123"));
    expect(url.origin + url.pathname).toBe(
      "https://kite.zerodha.com/connect/login",
    );
    expect(url.searchParams.get("v")).toBe("3");
    expect(url.searchParams.get("api_key")).toBe("abc123");
  });

  it("rejects an empty api_key", () => {
    expect(() => kiteLoginUrl("  ")).toThrow(/apiKey/);
  });
});

describe("kiteChecksum", () => {
  it("is SHA-256 hex of api_key + request_token + api_secret, in that order", () => {
    const expected = createHash("sha256")
      .update("key" + "token" + "secret", "utf8")
      .digest("hex");
    expect(kiteChecksum("key", "token", "secret")).toBe(expected);
  });

  it("changes when any input changes", () => {
    const base = kiteChecksum("key", "token", "secret");
    expect(kiteChecksum("key2", "token", "secret")).not.toBe(base);
    expect(kiteChecksum("key", "token2", "secret")).not.toBe(base);
    expect(kiteChecksum("key", "token", "secret2")).not.toBe(base);
  });

  it("rejects an empty secret rather than hashing it", () => {
    expect(() => kiteChecksum("key", "token", "")).toThrow(/apiSecret/);
  });
});

describe("kiteAuthorizationHeader", () => {
  it("uses the token api_key:access_token form", () => {
    expect(kiteAuthorizationHeader("key", "access")).toBe("token key:access");
  });
});

describe("zerodha declarations", () => {
  it("declares exactly the place-order capability", () => {
    expect(ZERODHA_PLACE_ORDER_CAPABILITY).toBe("zerodha:place-order");
  });

  it("reports the connector as passive in its description", () => {
    expect(ZerodhaMetadata.connectorId).toBe("zerodha");
    expect(ZerodhaMetadata.description).toMatch(/Places no orders/);
  });
});

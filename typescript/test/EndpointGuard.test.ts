import { describe, expect, it } from "vitest";

import { assertSafeEndpoint } from "../src/config/assertSafeEndpoint.js";

describe("assertSafeEndpoint", () => {
  it("accepts https endpoints", () => {
    expect(() =>
      assertSafeEndpoint("https://runtime.example.com"),
    ).not.toThrow();
  });

  it("accepts plain http only for loopback", () => {
    expect(() => assertSafeEndpoint("http://localhost:4000")).not.toThrow();
    expect(() => assertSafeEndpoint("http://127.0.0.1:4000")).not.toThrow();
    expect(() => assertSafeEndpoint("http://runtime.internal")).toThrow(
      /https/,
    );
  });

  it("refuses a loopback lookalike hostname", () => {
    expect(() => assertSafeEndpoint("http://localhost.evil.com")).toThrow(
      /https/,
    );
  });

  it("refuses credentials embedded in the URL", () => {
    expect(() =>
      assertSafeEndpoint("https://user:pass@runtime.example.com"),
    ).toThrow(/credentials/);
  });
});

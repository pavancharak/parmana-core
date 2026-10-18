import { describe, expect, it } from "vitest";

import { assertSafeApiBaseUrl } from "../../src/config.js";

describe("assertSafeApiBaseUrl", () => {
  it("accepts https in production and development", () => {
    expect(assertSafeApiBaseUrl("https://api.example.com/", true)).toBe(
      "https://api.example.com",
    );
    expect(assertSafeApiBaseUrl("https://api.example.com", false)).toBe(
      "https://api.example.com",
    );
  });

  it("allows plain http only for loopback, and only outside production", () => {
    expect(assertSafeApiBaseUrl("http://localhost:3000", false)).toBe(
      "http://localhost:3000",
    );
    expect(() => assertSafeApiBaseUrl("http://localhost:3000", true)).toThrow(
      /https:\/\/ in production/,
    );
  });

  it("refuses plain http to a remote host", () => {
    expect(() => assertSafeApiBaseUrl("http://api.example.com", false)).toThrow(
      /must use https/,
    );
  });

  it("refuses credentials embedded in the URL", () => {
    expect(() =>
      assertSafeApiBaseUrl("https://user:secret@api.example.com", true),
    ).toThrow(/must not contain credentials/);
  });

  it("refuses values that are not absolute URLs", () => {
    expect(() => assertSafeApiBaseUrl("api.example.com", true)).toThrow(
      /not a valid absolute URL/,
    );
  });
});

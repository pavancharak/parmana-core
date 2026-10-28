import { afterEach, describe, expect, it, vi } from "vitest";

import { readConnectorBaseUrl } from "../../../src/bootstrap/readConnectorBaseUrl.js";

const NAME = "SLACK_BASE_URL";

describe("readConnectorBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when the variable is unset", () => {
    vi.stubEnv(NAME, undefined);

    expect(readConnectorBaseUrl(NAME)).toBeUndefined();
  });

  it("accepts an https override outside tests", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(NAME, "https://slack.example.com/");

    expect(readConnectorBaseUrl(NAME)).toBe("https://slack.example.com");
  });

  it.each([
    "http://localhost:4010",
    "http://127.0.0.1:4010",
    "http://[::1]:4010",
  ])("refuses loopback http %s outside NODE_ENV=test", (value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(NAME, value);

    expect(() => readConnectorBaseUrl(NAME)).toThrow(
      `${NAME} must use https:// (http:// is allowed only for localhost in tests).`,
    );
  });

  it("refuses a remote http override in every environment", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(NAME, "http://slack.example.com");

    expect(() => readConnectorBaseUrl(NAME)).toThrow(
      `${NAME} must use https:// (http:// is allowed only for localhost in tests).`,
    );
  });

  it("accepts loopback http under NODE_ENV=test for the mock-server seam", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(NAME, "http://127.0.0.1:4010/");

    expect(readConnectorBaseUrl(NAME)).toBe("http://127.0.0.1:4010");
  });

  it("refuses embedded credentials", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(NAME, "https://user:secret@slack.example.com");

    expect(() => readConnectorBaseUrl(NAME)).toThrow(
      `${NAME} must not contain credentials in the URL.`,
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  SLACK_ALLOWED_POST_MESSAGE_PARAMETERS,
  SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
  isSlackCredentialValue,
  isSlackPostMessageResponse,
  redactSlackToken,
} from "../../src/SlackTypes.js";

describe("isSlackCredentialValue", () => {
  it("accepts a well-formed credential value", () => {
    expect(isSlackCredentialValue({ botToken: "xoxb-real-token" })).toBe(true);
  });

  it.each([
    [undefined],
    [null],
    ["a string"],
    [{}],
    [{ botToken: "" }],
    [{ botToken: 123 }],
    [{ notBotToken: "xoxb-real-token" }],
  ])("rejects %j", (value) => {
    expect(isSlackCredentialValue(value)).toBe(false);
  });
});

describe("redactSlackToken", () => {
  it("never returns a literal substring of the token", () => {
    const token = "xoxb-super-secret-token-0123456789";
    const redacted = redactSlackToken(token);

    expect(redacted.startsWith("fp_")).toBe(true);
    expect(redacted).not.toContain(token);
    expect(token).not.toContain(redacted.slice(3));
  });

  it("is deterministic for the same input", () => {
    expect(redactSlackToken("abc")).toBe(redactSlackToken("abc"));
  });

  it("differs for different inputs", () => {
    expect(redactSlackToken("abc")).not.toBe(redactSlackToken("xyz"));
  });
});

describe("SLACK_ALLOWED_POST_MESSAGE_PARAMETERS", () => {
  it("is exactly the deny-by-default allowlist this connector sends", () => {
    expect(SLACK_ALLOWED_POST_MESSAGE_PARAMETERS).toEqual(["channel", "text"]);
  });
});

describe("isSlackPostMessageResponse", () => {
  it("accepts a well-formed success response", () => {
    expect(
      isSlackPostMessageResponse({ ok: true, channel: "C1", ts: "123.456" }),
    ).toBe(true);
  });

  it("accepts a well-formed failure response (ok:false is still a valid shape)", () => {
    expect(
      isSlackPostMessageResponse({ ok: false, error: "channel_not_found" }),
    ).toBe(true);
  });

  it.each([
    ["missing ok", { channel: "C1" }],
    ["non-boolean ok", { ok: "true" }],
    ["null", null],
    ["a string", "not an object"],
  ])("rejects %s", (_label, value) => {
    expect(isSlackPostMessageResponse(value)).toBe(false);
  });
});

describe("SLACK_TEST_MODE_PLACEHOLDER_TOKEN", () => {
  it("is a fixed, obviously-fake placeholder -- not shaped like a real bot token, to avoid secret-scanner false positives", () => {
    expect(SLACK_TEST_MODE_PLACEHOLDER_TOKEN.length).toBeGreaterThan(0);
    expect(SLACK_TEST_MODE_PLACEHOLDER_TOKEN).toContain("placeholder");
    expect(SLACK_TEST_MODE_PLACEHOLDER_TOKEN.startsWith("xoxb-")).toBe(false);
  });
});

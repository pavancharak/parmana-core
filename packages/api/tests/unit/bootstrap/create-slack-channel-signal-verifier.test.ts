import { describe, expect, it } from "vitest";

import type { SignalStateVerificationRequest } from "@parmana/policy";

import {
  SLACK_ALLOWED_CHANNEL_IDS_ENV,
  SlackChannelSignalVerifier,
  createSlackChannelSignalVerifier,
  parseAllowedSlackChannelIds,
} from "../../../src/bootstrap/createSlackChannelSignalVerifier.js";

/**
 * G-76: a Slack post is checked against the server's channel allowlist,
 * not the caller's channelAuthorized.
 */
describe("SlackChannelSignalVerifier", () => {
  const verifier = new SlackChannelSignalVerifier(
    new Set(["C_ALLOWED", "C_ALSO_ALLOWED"]),
  );

  function post(
    channel: unknown,
    target: string = String(channel),
    action = "slack:post-message",
  ): SignalStateVerificationRequest {
    return {
      action,
      businessTransactionId: "btx-1",
      intentTarget: target,
      intentParameters: { channel, text: "hello" },
      stage: "authorize",
    };
  }

  const declared = { contentApproved: true, channelAuthorized: true };

  it("passes a post to an allowed channel that is the target", async () => {
    expect(await verifier.findViolations(post("C_ALLOWED"), declared)).toEqual(
      [],
    );
  });

  it("refuses a channel that is not in the allowlist, whatever the caller declares", async () => {
    expect(await verifier.findViolations(post("C_EXFIL"), declared)).toEqual([
      {
        signalKey: "channelAuthorized",
        declaredValue: true,
        actualValue: false,
      },
    ]);
  });

  it("refuses an allowed target whose parameters.channel is another channel", async () => {
    expect(
      await verifier.findViolations(post("C_EXFIL", "C_ALLOWED"), declared),
    ).toHaveLength(1);
  });

  it("refuses a missing or non string channel", async () => {
    expect(
      await verifier.findViolations(post(undefined, "C_ALLOWED"), declared),
    ).toHaveLength(1);
    expect(
      await verifier.findViolations(post(42, "C_ALLOWED"), declared),
    ).toHaveLength(1);
  });

  it("does not touch other actions", async () => {
    expect(
      await verifier.findViolations(
        post("C_EXFIL", "C_EXFIL", "paytm:refund"),
        declared,
      ),
    ).toEqual([]);
  });

  it("refuses every post when the allowlist is empty (fails closed)", async () => {
    const empty = createSlackChannelSignalVerifier({});

    expect(
      await empty.findViolations(post("C_ALLOWED"), declared),
    ).toHaveLength(1);
  });

  it("reads the allowlist from SLACK_ALLOWED_CHANNEL_IDS", async () => {
    const fromEnv = createSlackChannelSignalVerifier({
      [SLACK_ALLOWED_CHANNEL_IDS_ENV]: " C_ALLOWED , ,C_TWO",
    });

    expect(await fromEnv.findViolations(post("C_TWO"), declared)).toEqual([]);
    expect(parseAllowedSlackChannelIds(" C_ALLOWED , ,C_TWO")).toEqual(
      new Set(["C_ALLOWED", "C_TWO"]),
    );
  });
});

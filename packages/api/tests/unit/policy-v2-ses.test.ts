import { describe, expect, it } from "vitest";

import {
  policyV2ChannelsFromEnv,
  SesEmailChannel,
  type SesSender,
} from "../../src/policyV2/sesEmailChannel.js";

function fakeClient(
  result: { MessageId?: string } | Error,
): SesSender & { commands: unknown[] } {
  const commands: unknown[] = [];
  return {
    commands,
    async send(command) {
      commands.push(command.input);
      if (result instanceof Error) throw result;
      return result;
    },
  } as SesSender & { commands: unknown[] };
}

describe("the SES email channel", () => {
  it("sends the message from the configured sender, to the contact, and reports sent when SES returns an id", async () => {
    const client = fakeClient({ MessageId: "abc-123" });
    const channel = new SesEmailChannel(client, "alerts@example.com");
    const sent = await channel.send({
      to: "owner@example.com",
      subject: "[review] review-1",
      body: "Please review.",
    });
    expect(sent).toBe(true);
    expect(client.commands[0]).toEqual({
      Source: "alerts@example.com",
      Destination: { ToAddresses: ["owner@example.com"] },
      Message: {
        Subject: { Data: "[review] review-1", Charset: "UTF-8" },
        Body: { Text: { Data: "Please review.", Charset: "UTF-8" } },
      },
    });
  });

  it("does not report sent when SES returns no id", async () => {
    const channel = new SesEmailChannel(fakeClient({}), "alerts@example.com");
    expect(
      await channel.send({ to: "a@example.com", subject: "s", body: "b" }),
    ).toBe(false);
  });

  it("lets a failure from SES reach the caller, so the dispatch can record it", async () => {
    const channel = new SesEmailChannel(
      fakeClient(new Error("Email address is not verified")),
      "alerts@example.com",
    );
    await expect(
      channel.send({ to: "a@example.com", subject: "s", body: "b" }),
    ).rejects.toThrow(/not verified/);
  });
});

describe("the channels from the environment", () => {
  it("configures no channel when no sender is set", () => {
    expect(policyV2ChannelsFromEnv({})).toEqual({});
  });

  it("configures email when a sender is set", () => {
    const channels = policyV2ChannelsFromEnv(
      {
        PARMANA_POLICY_V2_EMAIL_FROM: "alerts@example.com",
        AWS_REGION: "eu-west-1",
      },
      fakeClient({}),
    );
    expect(channels.email).toBeDefined();
  });

  it("refuses a sender that is not an address, and a sender with no region", () => {
    expect(() =>
      policyV2ChannelsFromEnv({
        PARMANA_POLICY_V2_EMAIL_FROM: "not-an-address",
        AWS_REGION: "eu-west-1",
      }),
    ).toThrow(/must be an email address/);
    expect(() =>
      policyV2ChannelsFromEnv({
        PARMANA_POLICY_V2_EMAIL_FROM: "alerts@example.com",
      }),
    ).toThrow(/AWS_REGION/);
  });
});

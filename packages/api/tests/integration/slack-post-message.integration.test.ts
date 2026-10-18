import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type { BusinessTransaction } from "@parmana/shared";
import {
  MockSlackServer,
  SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-slack";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { createExecutionSystem } from "../../src/bootstrap/createExecutionSystem.js";
import { withTestApproval } from "../../../../test-support/approvals.js";

/**
 * G-76 at the HTTP boundary: a slack:post-message goes only to a channel
 * on the server's allowlist (SLACK_ALLOWED_CHANNEL_IDS), and only to the
 * channel named as the Intent's target, whatever the caller declares in
 * channelAuthorized. Uses the production bootstrap chain, pointed at a
 * hermetic MockSlackServer through SLACK_BASE_URL.
 */
describe("Slack post message (HTTP boundary)", () => {
  let server: MockSlackServer | undefined;

  const saved = {
    SLACK_BASE_URL: process.env.SLACK_BASE_URL,
    TEST_SLACK_BOT_TOKEN: process.env.TEST_SLACK_BOT_TOKEN,
    SLACK_ALLOWED_CHANNEL_IDS: process.env.SLACK_ALLOWED_CHANNEL_IDS,
  };

  afterEach(async () => {
    if (server !== undefined) {
      await server.close();
      server = undefined;
    }

    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  async function buildApp(allowedChannelIds: string | undefined): Promise<{
    app: ReturnType<typeof createApp>;
    server: MockSlackServer;
  }> {
    const mockServer = new MockSlackServer({
      botToken: SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
    });
    await mockServer.listen();
    server = mockServer;

    process.env.SLACK_BASE_URL = mockServer.baseUrl;
    process.env.TEST_SLACK_BOT_TOKEN = SLACK_TEST_MODE_PLACEHOLDER_TOKEN;

    if (allowedChannelIds === undefined) {
      delete process.env.SLACK_ALLOWED_CHANNEL_IDS;
    } else {
      process.env.SLACK_ALLOWED_CHANNEL_IDS = allowedChannelIds;
    }

    const executionSystem = await createExecutionSystem();
    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    return { app, server: mockServer };
  }

  function postTransaction(options: {
    target: string;
    channel?: string;
  }): Promise<BusinessTransaction> {
    const businessTransactionId = crypto.randomUUID();
    const authorityId = crypto.randomUUID();
    const authorizationId = crypto.randomUUID();
    const intentId = crypto.randomUUID();

    // A trusted person approved posting to this channel; the checks
    // below must still refuse what the approval does not cover.
    return withTestApproval({
      businessTransactionId,
      metadata: {
        businessTransactionId,
        correlationId: crypto.randomUUID(),
        createdBy: "integration-test",
        createdAt: new Date(),
      },
      authority: {
        authorityId,
        authorityType: "USER",
        principalId: "integration-test",
        displayName: "Integration Test",
        issuedAt: new Date(),
      },
      authorization: {
        authorizationId,
        authorityId,
        purpose: "Integration Test",
        authorizedAt: new Date(),
      },
      intent: {
        intentId,
        authorizationId,
        action: "slack:post-message",
        target: options.target,
        parameters: Object.freeze({
          channel: options.channel ?? options.target,
          text: "Deployment succeeded.",
        }),
        createdAt: new Date(),
      },
      policy: {
        name: "slack-post-message",
        version: "1.1.0",
        schemaVersion: "1.0.0",
      },
      // Everything a manipulated agent could declare.
      signals: {
        contentApproved: true,
        channelAuthorized: true,
        channelId: options.target,
      },
      decision: { outcome: "APPROVED" },
      status: "APPROVED",
      createdAt: new Date(),
    } as unknown as BusinessTransaction);
  }

  it("posts once to a channel on the allowlist", async () => {
    const { app, server: mockServer } = await buildApp("C_ALLOWED,C_OTHER");

    const response = await request(app)
      .post("/execute")
      .send(await postTransaction({ target: "C_ALLOWED" }));

    expect(response.status).toBe(200);
    expect(mockServer.calls).toHaveLength(1);
    expect(mockServer.calls[0]?.channel).toBe("C_ALLOWED");
  });

  it("refuses a post to an allowed channel with no signed human approval, never calling Slack", async () => {
    const { app, server: mockServer } = await buildApp("C_ALLOWED");
    const approved = await postTransaction({ target: "C_ALLOWED" });

    const response = await request(app)
      .post("/execute")
      .send({
        ...approved,
        signals: {
          contentApproved: true,
          channelAuthorized: true,
          channelId: "C_ALLOWED",
          postApproved: true,
        },
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(mockServer.calls).toHaveLength(0);
  });

  it("refuses a post approved for one channel when it targets another", async () => {
    const { app, server: mockServer } = await buildApp("C_ALLOWED,C_OTHER");
    const approvedForOther = await postTransaction({ target: "C_OTHER" });
    const toAllowed = await postTransaction({ target: "C_ALLOWED" });

    const response = await request(app)
      .post("/execute")
      .send({
        ...toAllowed,
        signals: {
          ...toAllowed.signals,
          approvalArtifact: approvedForOther.signals.approvalArtifact,
        },
      });

    expect(response.status).toBe(403);
    expect(mockServer.calls).toHaveLength(0);
  });

  it("refuses a channel that is not on the allowlist, although the caller declares channelAuthorized true", async () => {
    const { app, server: mockServer } = await buildApp("C_ALLOWED");

    const response = await request(app)
      .post("/execute")
      .send(await postTransaction({ target: "C_EXFIL" }));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("POLICY_DENIED");
    expect(response.body.error).toContain("channelAuthorized");
    expect(mockServer.calls).toHaveLength(0);
  });

  it("refuses an allowed target whose parameters.channel is another channel", async () => {
    const { app, server: mockServer } = await buildApp("C_ALLOWED");

    const response = await request(app)
      .post("/execute")
      .send(await postTransaction({ target: "C_ALLOWED", channel: "C_EXFIL" }));

    expect(response.status).toBe(403);
    expect(mockServer.calls).toHaveLength(0);
  });

  it("refuses every post when SLACK_ALLOWED_CHANNEL_IDS is not set (fails closed)", async () => {
    const { app, server: mockServer } = await buildApp(undefined);

    const response = await request(app)
      .post("/execute")
      .send(await postTransaction({ target: "C_ALLOWED" }));

    expect(response.status).toBe(403);
    expect(mockServer.calls).toHaveLength(0);
  });
});

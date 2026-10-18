import { generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { AuthorityType } from "@parmana/shared";
import type { PolicyChangeStepUpAuthorization } from "@parmana/shared";
import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ResolvedAddress } from "@parmana/shared";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";
import { BUILT_IN_CAPABILITY_NAMESPACES } from "../../src/routes/external-connectors.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * External connectors registered without a deploy (ADR-0013): human
 * callers only, maker is not checker, step up on approve and reject,
 * built in namespaces refused, and the endpoint's address checked when
 * proposed and again when approved. No network: every host resolves
 * through the table below.
 */
describe("External connector changes (HTTP boundary)", () => {
  const MAKER_KEY = "external-human-maker-raw-key-for-tests-only";
  const CHECKER_KEY = "external-human-checker-raw-key-for-tests-only";
  const SERVICE_KEY = "external-service-caller-raw-key-for-tests-only";

  const checkerStepUp = generateKeyPairSync("ed25519");
  const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();

  /**
   * Host name to addresses. A test may change an entry to simulate a
   * DNS change between proposal and approval.
   */
  const dnsTable = new Map<string, string[]>([
    ["erp.example.com", ["203.0.114.10"]],
    ["internal.example.com", ["10.0.0.7"]],
    ["mixed.example.com", ["203.0.114.10", "127.0.0.1"]],
  ]);

  async function lookup(hostname: string): Promise<readonly ResolvedAddress[]> {
    const addresses = dnsTable.get(hostname);

    if (addresses === undefined) {
      throw new Error("ENOTFOUND");
    }

    return addresses.map((address) => ({ address, family: 4 }));
  }

  function signStepUp(
    changeId: string,
    action: "approve" | "reject",
    privateKey: KeyObject = checkerStepUp.privateKey,
  ): Promise<PolicyChangeStepUpAuthorization> {
    return stepUpSigner.sign(
      { pendingPolicyChangeId: changeId, action },
      privateKey,
      "checker-step-up-key",
      120,
    );
  }

  function governanceApp() {
    const { executionSystem } = createInspectableExecutionSystem();

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "external-maker",
        keyHash: hashApiKey(MAKER_KEY),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "external-checker",
        keyHash: hashApiKey(CHECKER_KEY),
        credentialHolderType: AuthorityType.USER,
        stepUpPublicKey: checkerStepUp.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
      {
        callerId: "external-service",
        keyHash: hashApiKey(SERVICE_KEY),
        credentialHolderType: AuthorityType.SERVICE,
      },
    ]);

    return createApp(createApplication(executionSystem), {
      callerAuth: { authenticator, auditSink: new InMemoryCallerAuditSink() },
      stepUpVerifier: new PolicyChangeStepUpVerifier({
        nonceStore: new MemoryNonceStore(),
      }),
      externalEndpointLookup: lookup,
    });
  }

  let sequence = 0;

  /**
   * The repository is shared by every test in this process, so each
   * test registers its own capability.
   */
  function uniqueCapability(): string {
    sequence += 1;
    return `erp${Date.now()}x${sequence}:create-invoice`;
  }

  function registration(capability: string): Record<string, unknown> {
    return {
      action: "register",
      capability,
      endpointUrl: "https://erp.example.com/parmana/release",
      policy: "erp-invoice",
      allowedParameters: ["amount", "currency"],
    };
  }

  async function propose(
    app: ReturnType<typeof governanceApp>,
    body: Record<string, unknown>,
    key = MAKER_KEY,
  ) {
    return request(app)
      .post("/external-connectors/changes")
      .set("Authorization", `Bearer ${key}`)
      .send({ reason: "Test.", ...body });
  }

  async function approve(app: ReturnType<typeof governanceApp>, id: string) {
    return request(app)
      .post(`/external-connectors/changes/${id}/approve`)
      .set("Authorization", `Bearer ${CHECKER_KEY}`)
      .send({ stepUpAuthorization: await signStepUp(id, "approve") });
  }

  async function connectors(app: ReturnType<typeof governanceApp>) {
    const response = await request(app)
      .get("/external-connectors")
      .set("Authorization", `Bearer ${CHECKER_KEY}`);

    expect(response.status).toBe(200);

    return response.body.connectors as Array<Record<string, unknown>>;
  }

  describe("who may propose, approve and reject", () => {
    it("refuses a caller with no credential, and a service credential", async () => {
      const app = governanceApp();

      expect((await request(app).get("/external-connectors")).status).toBe(401);
      expect(
        (await propose(app, registration(uniqueCapability()), SERVICE_KEY))
          .status,
      ).toBe(403);
    });

    it("refuses the proposer as checker", async () => {
      const app = governanceApp();
      const proposed = await propose(app, registration(uniqueCapability()));

      const response = await request(app)
        .post(`/external-connectors/changes/${proposed.body.changeId}/approve`)
        .set("Authorization", `Bearer ${MAKER_KEY}`)
        .send({
          stepUpAuthorization: await signStepUp(
            proposed.body.changeId,
            "approve",
          ),
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE");
    });

    it("refuses an approval with no step up, or a step up for the other action", async () => {
      const app = governanceApp();
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const proposed = await propose(app, registration(uniqueCapability()));
      const url = `/external-connectors/changes/${proposed.body.changeId}/approve`;

      const none = await request(app)
        .post(url)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({});
      const otherAction = await request(app)
        .post(url)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          stepUpAuthorization: await signStepUp(
            proposed.body.changeId,
            "reject",
          ),
        });

      for (const response of [none, otherAction]) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
      }
      errors.mockRestore();
    });
  });

  describe("what may be proposed", () => {
    it("refuses malformed fields and a missing reason", async () => {
      const app = governanceApp();
      const capability = uniqueCapability();
      const valid = registration(capability);

      const cases = [
        { ...valid, action: "grant" },
        { ...valid, capability: "no-colon" },
        { ...valid, capability: "ERP:Create" },
        { ...valid, capability: "erp-:create" },
        { ...valid, capability: "erp--x:create" },
        { ...valid, capability: `erp:${"x".repeat(130)}` },
        { ...valid, policy: "Bad Policy" },
        { ...valid, policy: undefined },
        { ...valid, allowedParameters: "amount" },
        { ...valid, allowedParameters: ["amount", "amount"] },
        { ...valid, allowedParameters: ["has space"] },
        { ...valid, timeoutMs: 500 },
        { ...valid, timeoutMs: 30001 },
        { ...valid, timeoutMs: 1500.5 },
        { ...valid, reason: " " },
        { action: "revoke", capability, endpointUrl: valid.endpointUrl },
      ];

      for (const body of cases) {
        expect((await propose(app, body)).status, JSON.stringify(body)).toBe(
          400,
        );
      }
    });

    it("refuses every built in connector namespace", async () => {
      const app = governanceApp();

      expect([...BUILT_IN_CAPABILITY_NAMESPACES]).toEqual(
        expect.arrayContaining(["paytm", "hubspot", "github", "slack"]),
      );

      for (const namespace of BUILT_IN_CAPABILITY_NAMESPACES) {
        const response = await propose(
          app,
          registration(`${namespace}:anything`),
        );

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/built in connector/);
      }
    });

    it.each([
      ["http", "http://erp.example.com/release"],
      ["an IP literal", "https://203.0.114.10/release"],
      ["localhost", "https://localhost/release"],
      ["a private address", "https://internal.example.com/release"],
      ["any private address among public ones", "https://mixed.example.com/r"],
      ["a host that does not resolve", "https://nowhere.example.com/r"],
    ])("refuses an endpoint with %s", async (_label, endpointUrl) => {
      const app = governanceApp();

      const response = await propose(app, {
        ...registration(uniqueCapability()),
        endpointUrl,
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("EXTERNAL_ENDPOINT_ADDRESS_REFUSED");
    });

    it("refuses a second pending change for the same capability, and revoking one never registered", async () => {
      const app = governanceApp();
      const capability = uniqueCapability();

      expect((await propose(app, registration(capability))).status).toBe(201);
      expect((await propose(app, registration(capability))).status).toBe(409);
      expect(
        (
          await propose(app, {
            action: "revoke",
            capability: uniqueCapability(),
          })
        ).status,
      ).toBe(409);
    });
  });

  describe("register, then revoke", () => {
    it("stores the normalized endpoint and the default timeout, applies on approval, and revokes without deleting", async () => {
      const app = governanceApp();
      const capability = uniqueCapability();

      const proposed = await propose(app, {
        ...registration(capability),
        endpointUrl: "https://ERP.example.com/parmana/release",
      });
      expect(proposed.status).toBe(201);
      expect(proposed.body).toMatchObject({
        action: "register",
        capability,
        endpointUrl: "https://erp.example.com/parmana/release",
        policy: "erp-invoice",
        allowedParameters: ["amount", "currency"],
        timeoutMs: 10000,
        status: "PENDING_APPROVAL",
        proposedBy: "external-maker",
      });

      // Nothing is registered until the change is approved.
      expect(
        (await connectors(app)).some((c) => c.capability === capability),
      ).toBe(false);

      const approved = await approve(app, proposed.body.changeId);
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({
        status: "APPROVED",
        resolvedBy: "external-checker",
      });

      expect(
        (await connectors(app)).find((c) => c.capability === capability),
      ).toMatchObject({
        registrationId: proposed.body.changeId,
        endpointUrl: "https://erp.example.com/parmana/release",
        status: "active",
      });

      // One active registration per capability.
      expect((await propose(app, registration(capability))).status).toBe(409);

      const revoke = await propose(app, { action: "revoke", capability });
      expect(revoke.status).toBe(201);
      expect((await approve(app, revoke.body.changeId)).status).toBe(200);

      expect(
        (await connectors(app)).find((c) => c.capability === capability),
      ).toMatchObject({
        registrationId: proposed.body.changeId,
        status: "revoked",
        revokedByChangeId: revoke.body.changeId,
      });

      // After a revoke, the capability can be registered again.
      expect((await propose(app, registration(capability))).status).toBe(201);
    });

    it("checks the endpoint's address again on approval", async () => {
      const app = governanceApp();
      const capability = uniqueCapability();

      dnsTable.set("moving.example.com", ["203.0.114.20"]);
      const proposed = await propose(app, {
        ...registration(capability),
        endpointUrl: "https://moving.example.com/release",
      });
      expect(proposed.status).toBe(201);

      dnsTable.set("moving.example.com", ["169.254.169.254"]);
      const refused = await approve(app, proposed.body.changeId);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe("EXTERNAL_ENDPOINT_ADDRESS_REFUSED");

      expect(
        (await connectors(app)).some((c) => c.capability === capability),
      ).toBe(false);
    });
  });

  describe("reject", () => {
    it("needs a reason, resolves the change, and registers nothing", async () => {
      const app = governanceApp();
      const capability = uniqueCapability();
      const proposed = await propose(app, registration(capability));
      const id = proposed.body.changeId;

      const noReason = await request(app)
        .post(`/external-connectors/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({ stepUpAuthorization: await signStepUp(id, "reject") });
      expect(noReason.status).toBe(400);

      const rejected = await request(app)
        .post(`/external-connectors/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          rejectionReason: "Not this endpoint.",
          stepUpAuthorization: await signStepUp(id, "reject"),
        });
      expect(rejected.status).toBe(200);
      expect(rejected.body).toMatchObject({
        status: "REJECTED",
        resolvedBy: "external-checker",
        rejectionReason: "Not this endpoint.",
      });

      expect(
        (await connectors(app)).some((c) => c.capability === capability),
      ).toBe(false);

      // A resolved change cannot be approved afterwards.
      expect((await approve(app, id)).status).toBe(409);

      const listed = await request(app)
        .get("/external-connectors/changes?status=REJECTED")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      expect(
        listed.body.changes.map((c: { changeId: string }) => c.changeId),
      ).toContain(id);
    });
  });

  describe("more edges", () => {
    it("accepts the timeout limits and an empty parameter list, and refuses just outside them", async () => {
      const app = governanceApp();

      for (const timeoutMs of [1000, 30000]) {
        const response = await propose(app, {
          ...registration(uniqueCapability()),
          timeoutMs,
        });
        expect(response.status).toBe(201);
        expect(response.body.timeoutMs).toBe(timeoutMs);
      }

      for (const timeoutMs of [999, 30001, "10000"]) {
        expect(
          (
            await propose(app, {
              ...registration(uniqueCapability()),
              timeoutMs,
            })
          ).status,
        ).toBe(400);
      }

      const none = await propose(app, {
        ...registration(uniqueCapability()),
        allowedParameters: [],
      });
      expect(none.status).toBe(201);
      expect(none.body.allowedParameters).toEqual([]);

      const tooMany = await propose(app, {
        ...registration(uniqueCapability()),
        allowedParameters: Array.from({ length: 65 }, (_, i) => `p${i}`),
      });
      expect(tooMany.status).toBe(400);
    });

    it("refuses a second revoke of the same registration", async () => {
      const app = governanceApp();
      const capability = uniqueCapability();

      const registered = await propose(app, registration(capability));
      await approve(app, registered.body.changeId);

      const revoke = await propose(app, { action: "revoke", capability });
      expect((await approve(app, revoke.body.changeId)).status).toBe(200);

      expect(
        (await propose(app, { action: "revoke", capability })).status,
      ).toBe(409);
    });

    it("lists changes newest first, and filters by status", async () => {
      const app = governanceApp();
      const older = await propose(app, registration(uniqueCapability()));
      const newer = await propose(app, registration(uniqueCapability()));
      await approve(app, older.body.changeId);

      const pending = await request(app)
        .get("/external-connectors/changes?status=PENDING_APPROVAL")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      const pendingIds = pending.body.changes.map(
        (c: { changeId: string }) => c.changeId,
      );
      expect(pendingIds).toContain(newer.body.changeId);
      expect(pendingIds).not.toContain(older.body.changeId);

      const all = await request(app)
        .get("/external-connectors/changes")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      const allIds: string[] = all.body.changes.map(
        (c: { changeId: string }) => c.changeId,
      );
      expect(allIds.indexOf(newer.body.changeId)).toBeLessThan(
        allIds.indexOf(older.body.changeId),
      );

      expect(
        (
          await request(app)
            .get("/external-connectors/changes?status=DONE")
            .set("Authorization", `Bearer ${CHECKER_KEY}`)
        ).status,
      ).toBe(400);
    });

    it("answers 404 for an unknown change, on approve and on reject", async () => {
      const app = governanceApp();
      const id = "00000000-0000-0000-0000-000000000000";

      const approved = await approve(app, id);
      expect(approved.status).toBe(404);
      expect(approved.body.code).toBe("EXTERNAL_CONNECTOR_CHANGE_NOT_FOUND");

      const rejected = await request(app)
        .post(`/external-connectors/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          rejectionReason: "No.",
          stepUpAuthorization: await signStepUp(id, "reject"),
        });
      expect(rejected.status).toBe(404);
    });

    it("normalizes the endpoint's host and default port before storing it, so the audience is stable", async () => {
      const app = governanceApp();

      const response = await propose(app, {
        ...registration(uniqueCapability()),
        endpointUrl: "https://ERP.Example.COM:443/parmana/release",
      });

      expect(response.status).toBe(201);
      expect(response.body.endpointUrl).toBe(
        "https://erp.example.com/parmana/release",
      );
    });
  });
});

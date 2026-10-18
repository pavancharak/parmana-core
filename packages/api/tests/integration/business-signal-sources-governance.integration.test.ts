import { generateKeyPairSync } from "node:crypto";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { AuthorityType } from "@parmana/shared";
import type {
  PolicyChangeStepUpAuthorization,
  ResolvedAddress,
} from "@parmana/shared";
import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";
import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * Business signal sources registered without a deploy (RFC-0023 phase
 * 2): human callers only, maker is not checker, step up on approve and
 * reject, the endpoint's address checked when proposed and again when
 * approved, and an optional Ed25519 key stored in canonical form. No
 * network: every host resolves through the table below.
 */
describe("Business signal source changes (HTTP boundary)", () => {
  const MAKER_KEY = "source-human-maker-raw-key-for-tests-only";
  const CHECKER_KEY = "source-human-checker-raw-key-for-tests-only";
  const SERVICE_KEY = "source-service-caller-raw-key-for-tests-only";

  const checkerStepUp = generateKeyPairSync("ed25519");
  const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();
  const sourceKey = generateKeyPairSync("ed25519");
  const sourcePublicKeyPem = sourceKey.publicKey
    .export({ format: "pem", type: "spki" })
    .toString();

  const dnsTable = new Map<string, string[]>([
    ["orders.example.com", ["203.0.114.10"]],
    ["internal.example.com", ["10.0.0.7"]],
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
  ): Promise<PolicyChangeStepUpAuthorization> {
    return stepUpSigner.sign(
      { pendingPolicyChangeId: changeId, action },
      checkerStepUp.privateKey,
      "checker-step-up-key",
      120,
    );
  }

  function governanceApp() {
    const { executionSystem } = createInspectableExecutionSystem();

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "source-maker",
        keyHash: hashApiKey(MAKER_KEY),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "source-checker",
        keyHash: hashApiKey(CHECKER_KEY),
        credentialHolderType: AuthorityType.USER,
        stepUpPublicKey: checkerStepUp.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
      {
        callerId: "source-service",
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

  /** The repository is shared by every test in this process. */
  function uniqueName(): string {
    sequence += 1;
    return `orders-${Date.now()}-${sequence}`;
  }

  function registration(name: string): Record<string, unknown> {
    return {
      action: "register",
      name,
      endpointUrl: "https://orders.example.com/parmana/signals",
    };
  }

  async function propose(
    app: ReturnType<typeof governanceApp>,
    body: Record<string, unknown>,
    key = MAKER_KEY,
  ) {
    return request(app)
      .post("/business-signal-sources/changes")
      .set("Authorization", `Bearer ${key}`)
      .send({ reason: "Test.", ...body });
  }

  async function approve(app: ReturnType<typeof governanceApp>, id: string) {
    return request(app)
      .post(`/business-signal-sources/changes/${id}/approve`)
      .set("Authorization", `Bearer ${CHECKER_KEY}`)
      .send({ stepUpAuthorization: await signStepUp(id, "approve") });
  }

  async function sources(app: ReturnType<typeof governanceApp>) {
    const response = await request(app)
      .get("/business-signal-sources")
      .set("Authorization", `Bearer ${CHECKER_KEY}`);

    expect(response.status).toBe(200);

    return response.body.sources as Array<Record<string, unknown>>;
  }

  describe("who may propose, approve and reject", () => {
    it("refuses a caller with no credential, and a service credential", async () => {
      const app = governanceApp();

      expect((await request(app).get("/business-signal-sources")).status).toBe(
        401,
      );

      const service = await propose(
        app,
        registration(uniqueName()),
        SERVICE_KEY,
      );
      expect(service.status).toBe(403);
      expect(service.body.code).toBe("NON_HUMAN_CALLER_DENIED");
    });

    it("refuses the proposer as checker", async () => {
      const app = governanceApp();
      const proposed = await propose(app, registration(uniqueName()));

      const response = await request(app)
        .post(
          `/business-signal-sources/changes/${proposed.body.changeId}/approve`,
        )
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
      const proposed = await propose(app, registration(uniqueName()));
      const url = `/business-signal-sources/changes/${proposed.body.changeId}/approve`;

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

    it("answers 404 for an unknown change", async () => {
      const app = governanceApp();
      const id = "00000000-0000-0000-0000-000000000000";

      const response = await approve(app, id);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe(
        "BUSINESS_SIGNAL_SOURCE_CHANGE_NOT_FOUND",
      );
    });
  });

  describe("what may be proposed", () => {
    it("refuses malformed fields and a missing reason", async () => {
      const app = governanceApp();
      const name = uniqueName();
      const valid = registration(name);
      const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
        .publicKey.export({ format: "pem", type: "spki" })
        .toString();

      const cases = [
        { ...valid, action: "grant" },
        { ...valid, name: "Orders" },
        { ...valid, name: "-orders" },
        { ...valid, name: `o${"x".repeat(63)}` },
        { ...valid, timeoutMs: 500 },
        { ...valid, timeoutMs: 30001 },
        { ...valid, timeoutMs: 1500.5 },
        { ...valid, publicKeyPem: "not a key" },
        { ...valid, publicKeyPem: rsa },
        { ...valid, publicKeyPem: 42 },
        { ...valid, keyId: "orders-2026" },
        { ...valid, publicKeyPem: sourcePublicKeyPem, keyId: "has space" },
        { ...valid, reason: " " },
        { action: "revoke", name, endpointUrl: valid.endpointUrl },
        { action: "revoke", name, publicKeyPem: sourcePublicKeyPem },
      ];

      for (const body of cases) {
        const response = await propose(app, body);

        expect(response.status, JSON.stringify(body)).toBe(400);
        expect(response.body.code).toBe("INVALID_BUSINESS_SIGNAL_SOURCE");
      }
    });

    it.each([
      ["http", "http://orders.example.com/signals"],
      ["an IP literal", "https://203.0.114.10/signals"],
      ["localhost", "https://localhost/signals"],
      ["a private address", "https://internal.example.com/signals"],
      ["a host that does not resolve", "https://nowhere.example.com/s"],
    ])("refuses an endpoint with %s", async (_label, endpointUrl) => {
      const app = governanceApp();

      const response = await propose(app, {
        ...registration(uniqueName()),
        endpointUrl,
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("EXTERNAL_ENDPOINT_ADDRESS_REFUSED");
    });

    it("refuses a second pending change for the same name, and revoking one never registered", async () => {
      const app = governanceApp();
      const name = uniqueName();

      expect((await propose(app, registration(name))).status).toBe(201);
      expect((await propose(app, registration(name))).status).toBe(409);
      expect(
        (await propose(app, { action: "revoke", name: uniqueName() })).status,
      ).toBe(409);
    });
  });

  describe("register, then revoke", () => {
    it("stores the normalized endpoint, the default timeout and the key, applies on approval, and revokes without deleting", async () => {
      const app = governanceApp();
      const name = uniqueName();

      // A key with its PEM lines rewrapped is stored in canonical form.
      const loose = `\n${sourcePublicKeyPem.replace(/\n/g, "\r\n")}\n`;

      const proposed = await propose(app, {
        ...registration(name),
        endpointUrl: "https://ORDERS.example.com/parmana/signals",
        publicKeyPem: loose,
        keyId: "orders-2026-10",
      });
      expect(proposed.status).toBe(201);
      expect(proposed.body).toMatchObject({
        action: "register",
        name,
        endpointUrl: "https://orders.example.com/parmana/signals",
        timeoutMs: 10000,
        publicKeyPem: sourcePublicKeyPem,
        keyId: "orders-2026-10",
        status: "PENDING_APPROVAL",
        proposedBy: "source-maker",
      });

      // Nothing is registered until the change is approved.
      expect((await sources(app)).some((s) => s.name === name)).toBe(false);

      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      const approved = await approve(app, proposed.body.changeId);
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({
        status: "APPROVED",
        resolvedBy: "source-checker",
      });
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "business_signal_source_change_approved",
          name,
          signed: true,
        }),
      );

      expect((await sources(app)).find((s) => s.name === name)).toMatchObject({
        registrationId: proposed.body.changeId,
        endpointUrl: "https://orders.example.com/parmana/signals",
        publicKeyPem: sourcePublicKeyPem,
        keyId: "orders-2026-10",
        status: "active",
      });

      // One active registration per name.
      expect((await propose(app, registration(name))).status).toBe(409);

      const revoke = await propose(app, { action: "revoke", name });
      expect(revoke.status).toBe(201);
      expect((await approve(app, revoke.body.changeId)).status).toBe(200);
      info.mockRestore();

      expect((await sources(app)).find((s) => s.name === name)).toMatchObject({
        registrationId: proposed.body.changeId,
        status: "revoked",
        revokedByChangeId: revoke.body.changeId,
      });

      // After a revoke, the name can be registered again.
      expect((await propose(app, registration(name))).status).toBe(201);
    });

    it("checks the endpoint's address again on approval", async () => {
      const app = governanceApp();
      const name = uniqueName();

      dnsTable.set("moving-orders.example.com", ["203.0.114.20"]);
      const proposed = await propose(app, {
        ...registration(name),
        endpointUrl: "https://moving-orders.example.com/signals",
      });
      expect(proposed.status).toBe(201);

      dnsTable.set("moving-orders.example.com", ["169.254.169.254"]);
      const refused = await approve(app, proposed.body.changeId);
      expect(refused.status).toBe(400);
      expect(refused.body.code).toBe("EXTERNAL_ENDPOINT_ADDRESS_REFUSED");

      expect((await sources(app)).some((s) => s.name === name)).toBe(false);
    });
  });

  describe("reject", () => {
    it("needs a reason, resolves the change once, and registers nothing", async () => {
      const app = governanceApp();
      const name = uniqueName();
      const proposed = await propose(app, registration(name));
      const id = proposed.body.changeId;

      const noReason = await request(app)
        .post(`/business-signal-sources/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({ stepUpAuthorization: await signStepUp(id, "reject") });
      expect(noReason.status).toBe(400);

      const rejected = await request(app)
        .post(`/business-signal-sources/changes/${id}/reject`)
        .set("Authorization", `Bearer ${CHECKER_KEY}`)
        .send({
          rejectionReason: "Not this endpoint.",
          stepUpAuthorization: await signStepUp(id, "reject"),
        });
      expect(rejected.status).toBe(200);
      expect(rejected.body).toMatchObject({
        status: "REJECTED",
        resolvedBy: "source-checker",
        rejectionReason: "Not this endpoint.",
      });

      const again = await approve(app, id);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("CONFLICT");

      expect((await sources(app)).some((s) => s.name === name)).toBe(false);

      const pending = await request(app)
        .get("/business-signal-sources/changes?status=PENDING_APPROVAL")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      expect(pending.status).toBe(200);
      expect(
        (pending.body.changes as Array<{ changeId: string }>).some(
          (change) => change.changeId === id,
        ),
      ).toBe(false);

      const badStatus = await request(app)
        .get("/business-signal-sources/changes?status=DONE")
        .set("Authorization", `Bearer ${CHECKER_KEY}`);
      expect(badStatus.status).toBe(400);
    });
  });
});

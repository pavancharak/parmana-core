import { generateKeyPairSync } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorityType } from "@parmana/shared";
import type { PolicyChangeStepUpAuthorization } from "@parmana/shared";
import {
  PolicyChangeStepUpAuthorizationSigner,
  PolicyChangeCrypto,
} from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { MemoryPolicyChangeApprovalRecordRepository } from "@parmana/storage";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { hashApiKey } from "../../src/auth/hashApiKey.js";
import { StaticKeyAuthenticator } from "../../src/auth/StaticKeyAuthenticator.js";
import { InMemoryCallerAuditSink } from "../../src/auth/InMemoryCallerAuditSink.js";
import { PolicyChangeStepUpVerifier } from "../../src/auth/PolicyChangeStepUpVerifier.js";
import { PolicyChangeApprovalService } from "../../src/governance/PolicyChangeApprovalService.js";

import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * HTTP-level proof for the Policy Governance (maker-checker) batch:
 * isHumanCaller.ts enforced on all four pending-policy-changes.ts
 * endpoints, maker != checker on approve/reject, the
 * caller.non_human_denied audit event, and (Layer 4) step-up
 * authorization on approve/reject. This is deliberately the one place
 * caller identity is discriminated by type -- see isHumanCaller.ts's
 * own comment for why the rest of the pipeline (POST /execute,
 * /transactions) stays actor-agnostic.
 */
/**
 * POSTs JSON to `rawPath` exactly as given, without the client side
 * dot-segment resolution supertest applies.
 */
async function rawPost(
  app: http.RequestListener,
  rawPath: string,
  apiKey: string,
  body: unknown,
): Promise<{ status: number; body: { error?: string } }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const payload = JSON.stringify(body);

    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: rawPath,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (text += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(text || "{}"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("Policy Governance: isHumanCaller, maker != checker, step-up (HTTP boundary)", () => {
  const HUMAN_MAKER_KEY = "governance-human-maker-raw-key-for-tests-only";
  const HUMAN_CHECKER_KEY = "governance-human-checker-raw-key-for-tests-only";
  const SERVICE_KEY = "governance-service-caller-raw-key-for-tests-only";
  const UNVERIFIED_KEY = "governance-unverified-caller-raw-key-for-tests-only";

  const checkerStepUpKeyPair = generateKeyPairSync("ed25519");
  const stepUpSigner = new PolicyChangeStepUpAuthorizationSigner();

  function signStepUp(
    pendingPolicyChangeId: string,
    action: "approve" | "reject",
    privateKey: KeyObject = checkerStepUpKeyPair.privateKey,
    ttlSeconds = 120,
  ): Promise<PolicyChangeStepUpAuthorization> {
    return stepUpSigner.sign(
      { pendingPolicyChangeId, action },
      privateKey,
      "human-checker-step-up-key",
      ttlSeconds,
    );
  }

  /**
   * Extracts the `checks` object from the requireStepUpAuthorization
   * console.error call (see pending-policy-changes.ts) -- the only
   * place per-check diagnostic detail is allowed to surface, since the
   * HTTP response deliberately excludes it.
   */
  function loggedChecks(
    consoleError: ReturnType<typeof vi.spyOn>,
  ): Readonly<Record<string, boolean>> {
    const call = consoleError.mock.calls.find(
      ([entry]) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { event?: unknown }).event ===
          "step_up_authorization_invalid",
    );

    if (call === undefined) {
      throw new Error(
        "expected a step_up_authorization_invalid console.error call",
      );
    }

    return (call[0] as { checks: Readonly<Record<string, boolean>> }).checks;
  }

  /**
   * Scratch policies/ directories created by buildApp() below, one
   * per test that calls it -- cleaned up after each test so approve
   * tests never leave real-looking policy directories behind. Deliberately
   * NOT the real packages/policies/ tree application.ts's own
   * policyRepository singleton reads from: a write-capable
   * FilePolicyRepository pointed at that real directory would litter
   * it with fake test policy names (e.g.
   * "governance-approve-distinct-checker") on every run.
   */
  const scratchPolicyDirs: string[] = [];

  afterEach(() => {
    for (const dir of scratchPolicyDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function buildApp() {
    const { executionSystem } = createInspectableExecutionSystem();
    const application = createApplication(executionSystem);

    const scratchPolicyDir = mkdtempSync(
      path.join(tmpdir(), "parmana-governance-policies-"),
    );
    scratchPolicyDirs.push(scratchPolicyDir);

    const policyChangeApprovalRecordRepository =
      new MemoryPolicyChangeApprovalRecordRepository();

    const policyChangeApprovalService = new PolicyChangeApprovalService({
      policyRepository: new FilePolicyRepository(scratchPolicyDir),
      policyChangeCrypto: new PolicyChangeCrypto(),
      policyChangeApprovalRecordRepository,
    });

    const authenticator = new StaticKeyAuthenticator([
      {
        callerId: "human-maker",
        keyHash: hashApiKey(HUMAN_MAKER_KEY),
        credentialHolderType: AuthorityType.USER,
      },
      {
        callerId: "human-checker",
        keyHash: hashApiKey(HUMAN_CHECKER_KEY),
        credentialHolderType: AuthorityType.USER,
        stepUpPublicKey: checkerStepUpKeyPair.publicKey
          .export({ format: "pem", type: "spki" })
          .toString(),
      },
      {
        callerId: "service-caller",
        keyHash: hashApiKey(SERVICE_KEY),
        credentialHolderType: AuthorityType.SERVICE,
      },
      {
        callerId: "unverified-caller",
        keyHash: hashApiKey(UNVERIFIED_KEY),
        // credentialHolderType intentionally omitted: the fail-closed
        // "not verified" default, not "assume human".
      },
    ]);

    const callerAuditSink = new InMemoryCallerAuditSink();

    const stepUpVerifier = new PolicyChangeStepUpVerifier({
      nonceStore: new MemoryNonceStore(),
    });

    const app = createApp(application, {
      callerAuth: { authenticator, auditSink: callerAuditSink },
      stepUpVerifier,
      policyChangeApprovalService,
    });

    return {
      app,
      callerAuditSink,
      scratchPolicyDir,
      policyChangeApprovalRecordRepository,
    };
  }

  function policyBody(policyId: string) {
    return {
      policyId,
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      approvalSignals: { humanApproved: { resourceId: "target" } },
      rules: [
        {
          id: "approve-with-approval",
          condition: { fact: "humanApproved", operator: "is_true" },
          outcome: { action: "approve", reason: "test fixture" },
        },
      ],
    };
  }

  describe("POST /policies/:name/:version/pending-changes (propose)", () => {
    it("allows a human-credentialed caller to propose", async () => {
      const { app } = buildApp();
      const name = "governance-propose-human";

      const response = await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`)
        .send({ proposedContent: policyBody(name), reason: "test proposal" });

      expect(response.status).toBe(201);
    });

    it("refuses to propose a policy that approves without a signed human approval", async () => {
      const { app } = buildApp();
      const name = "governance-propose-no-approval";

      const response = await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`)
        .send({
          proposedContent: {
            policyId: name,
            policyVersion: "1.0.0",
            schemaVersion: "1.0.0",
            rules: [
              {
                id: "always-approve",
                condition: { always: true },
                outcome: { action: "approve", reason: "no human" },
              },
            ],
          },
          reason: "test proposal",
        });

      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain(
        "approves without a signed human approval",
      );
    });

    it("denies a SERVICE-credentialed caller with 403 NON_HUMAN_CALLER_DENIED", async () => {
      const { app } = buildApp();
      const name = "governance-propose-service";

      const response = await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${SERVICE_KEY}`)
        .send({ proposedContent: policyBody(name), reason: "test proposal" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("NON_HUMAN_CALLER_DENIED");
    });

    it("fail-closed default: an unverified (no credentialHolderType) caller is denied the same as a non-human one", async () => {
      const { app } = buildApp();
      const name = "governance-propose-unverified";

      const response = await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${UNVERIFIED_KEY}`)
        .send({ proposedContent: policyBody(name), reason: "test proposal" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("NON_HUMAN_CALLER_DENIED");
    });

    it("records a flagged caller.non_human_denied audit event, never the raw key", async () => {
      const { app, callerAuditSink } = buildApp();
      const name = "governance-propose-audit";

      await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${SERVICE_KEY}`)
        .send({ proposedContent: policyBody(name), reason: "test proposal" });

      const denied = callerAuditSink.events.find(
        (event) => event.type === "caller.non_human_denied",
      );

      expect(denied).toMatchObject({
        type: "caller.non_human_denied",
        callerId: "service-caller",
        severity: "flagged",
      });

      const serialized = JSON.stringify(callerAuditSink.events);
      expect(serialized).not.toContain(SERVICE_KEY);
    });
  });

  describe("GET /policies/pending-changes (list)", () => {
    it("requires caller authentication", async () => {
      const { app } = buildApp();

      const response = await request(app).get("/policies/pending-changes");

      expect(response.status).toBe(401);
    });

    it("denies a non-human caller with 403 NON_HUMAN_CALLER_DENIED", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get("/policies/pending-changes")
        .set("Authorization", `Bearer ${SERVICE_KEY}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("NON_HUMAN_CALLER_DENIED");
    });

    it("allows a human-credentialed caller to list", async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get("/policies/pending-changes")
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`);

      expect(response.status).toBe(200);
    });
  });

  describe("POST /policies/pending-changes/:id/approve and /reject (maker != checker, step-up)", () => {
    async function proposeChange(app: import("express").Express, name: string) {
      const response = await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`)
        .send({ proposedContent: policyBody(name), reason: "test proposal" });

      return response.body.pendingPolicyChangeId as string;
    }

    it("denies a non-human caller attempting to approve, with 403 NON_HUMAN_CALLER_DENIED", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-approve-non-human");

      const response = await request(app)
        .post(`/policies/pending-changes/${id}/approve`)
        .set("Authorization", `Bearer ${SERVICE_KEY}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("NON_HUMAN_CALLER_DENIED");
    });

    it("denies a non-human caller attempting to reject, with 403 NON_HUMAN_CALLER_DENIED", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-reject-non-human");

      const response = await request(app)
        .post(`/policies/pending-changes/${id}/reject`)
        .set("Authorization", `Bearer ${SERVICE_KEY}`)
        .send({ rejectionReason: "does not meet bar" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("NON_HUMAN_CALLER_DENIED");
    });

    it("rejects the maker approving its own change with 403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-approve-same-actor");

      const response = await request(app)
        .post(`/policies/pending-changes/${id}/approve`)
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE");
    });

    it("rejects the maker rejecting its own change with 403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-reject-same-actor");

      const response = await request(app)
        .post(`/policies/pending-changes/${id}/reject`)
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`)
        .send({ rejectionReason: "changed my mind" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE");
    });

    it("denies approval with a valid bearer token + correct checker identity but NO step-up envelope, 403 STEP_UP_AUTHORIZATION_INVALID", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-approve-missing-step-up");

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const response = await request(app)
          .post(`/policies/pending-changes/${id}/approve`)
          .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`);

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
        // Per-check diagnostics are for server-side operators only --
        // never in the HTTP response, see requireStepUpAuthorization's
        // doc comment.
        expect(response.body.checks).toBeUndefined();
        expect(loggedChecks(consoleError)).toMatchObject({ present: false });
      } finally {
        consoleError.mockRestore();
      }
    });

    it("denies approval with an expired step-up envelope", async () => {
      vi.useFakeTimers();

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const { app } = buildApp();
        const id = await proposeChange(
          app,
          "governance-approve-expired-step-up",
        );

        const stepUpAuthorization = await signStepUp(
          id,
          "approve",
          undefined,
          1,
        );

        // Advance real clock time past the envelope's 1-second TTL.
        vi.advanceTimersByTime(2_000);

        const response = await request(app)
          .post(`/policies/pending-changes/${id}/approve`)
          .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
          .send({ stepUpAuthorization });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
        expect(response.body.checks).toBeUndefined();
        expect(loggedChecks(consoleError)).toMatchObject({ notExpired: false });
      } finally {
        vi.useRealTimers();
        consoleError.mockRestore();
      }
    });

    it("denies a step-up envelope bound to a different pendingPolicyChangeId", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-approve-wrong-id");
      const otherId = await proposeChange(
        app,
        "governance-approve-wrong-id-other",
      );

      const stepUpAuthorization = await signStepUp(otherId, "approve");

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const response = await request(app)
          .post(`/policies/pending-changes/${id}/approve`)
          .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
          .send({ stepUpAuthorization });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
        expect(response.body.checks).toBeUndefined();
        expect(loggedChecks(consoleError)).toMatchObject({
          pendingPolicyChangeIdMatches: false,
        });
      } finally {
        consoleError.mockRestore();
      }
    });

    it("denies a step-up envelope signed for the wrong action (reject envelope on an approve request)", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-approve-wrong-action");

      const stepUpAuthorization = await signStepUp(id, "reject");

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const response = await request(app)
          .post(`/policies/pending-changes/${id}/approve`)
          .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
          .send({ stepUpAuthorization });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
        expect(response.body.checks).toBeUndefined();
        expect(loggedChecks(consoleError)).toMatchObject({
          actionMatches: false,
        });
      } finally {
        consoleError.mockRestore();
      }
    });

    it("denies a step-up envelope signed with a key other than the checker's registered one", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-approve-wrong-key");

      const impostorKeyPair = generateKeyPairSync("ed25519");
      const stepUpAuthorization = await signStepUp(
        id,
        "approve",
        impostorKeyPair.privateKey,
      );

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const response = await request(app)
          .post(`/policies/pending-changes/${id}/approve`)
          .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
          .send({ stepUpAuthorization });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
        expect(response.body.checks).toBeUndefined();
        expect(loggedChecks(consoleError)).toMatchObject({
          signatureVerified: false,
        });
      } finally {
        consoleError.mockRestore();
      }
    });

    it("allows a distinct human checker to approve with a valid step-up envelope", async () => {
      const { app } = buildApp();
      const id = await proposeChange(
        app,
        "governance-approve-distinct-checker",
      );

      const stepUpAuthorization = await signStepUp(id, "approve");

      const response = await request(app)
        .post(`/policies/pending-changes/${id}/approve`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({ stepUpAuthorization });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("APPROVED");
      expect(response.body.resolvedBy).toBe("human-checker");
    });

    it("writes the live policy.json file and records a signed PolicyChangeApprovalRecord on approval", async () => {
      const { app, scratchPolicyDir, policyChangeApprovalRecordRepository } =
        buildApp();
      const name = "governance-approve-writes-file";
      const id = await proposeChange(app, name);

      const stepUpAuthorization = await signStepUp(id, "approve");

      const response = await request(app)
        .post(`/policies/pending-changes/${id}/approve`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({ stepUpAuthorization });

      expect(response.status).toBe(200);

      const written = JSON.parse(
        readFileSync(
          path.join(scratchPolicyDir, name, "1.0.0", "policy.json"),
          "utf8",
        ),
      );
      expect(written).toEqual(policyBody(name));

      const records = await policyChangeApprovalRecordRepository.list();
      expect(records).toHaveLength(1);

      const record = records[0];
      expect(record.pendingPolicyChangeId).toBe(id);
      expect(record.policyName).toBe(name);
      expect(record.policyVersion).toBe("1.0.0");
      expect(record.proposedBy).toBe("human-maker");
      expect(record.approvedBy).toBe("human-checker");
      // A brand-new version has no prior content to hash.
      expect(record.contentHashBefore).toBeUndefined();
      expect(record.contentHashAfter).toEqual(expect.any(String));

      const crypto = new PolicyChangeCrypto();
      await expect(crypto.verify(record)).resolves.toBe(true);
      await expect(crypto.hashPolicyContent(policyBody(name))).resolves.toBe(
        record.contentHashAfter,
      );
    });

    it("refuses to replace an approved version in place with different content (409), and leaves the stored version unchanged", async () => {
      const { app, policyChangeApprovalRecordRepository } = buildApp();
      const name = "governance-approve-reapproves-version";

      const firstId = await proposeChange(app, name);
      const firstStepUp = await signStepUp(firstId, "approve");

      await request(app)
        .post(`/policies/pending-changes/${firstId}/approve`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({ stepUpAuthorization: firstStepUp });

      // Only rejects, so it declares no approval signal.
      const { approvalSignals: _unused, ...rejectOnly } = policyBody(name);
      const patchedContent = {
        ...rejectOnly,
        rules: [
          {
            id: "always-reject",
            condition: { always: true },
            outcome: { action: "reject", reason: "patched fixture" },
          },
        ],
      };

      const secondPropose = await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`)
        .send({ proposedContent: patchedContent, reason: "in-place patch" });

      const secondId = secondPropose.body.pendingPolicyChangeId as string;
      const secondStepUp = await signStepUp(secondId, "approve");

      const secondResponse = await request(app)
        .post(`/policies/pending-changes/${secondId}/approve`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({ stepUpAuthorization: secondStepUp });

      expect(secondResponse.status).toBe(409);

      // No approval record for the refused change.
      const records = await policyChangeApprovalRecordRepository.list();
      expect(
        records.find((record) => record.pendingPolicyChangeId === secondId),
      ).toBeUndefined();

      // The stored version is still the original content.
      const crypto = new PolicyChangeCrypto();
      const stored = await new FilePolicyRepository(
        scratchPolicyDirs[scratchPolicyDirs.length - 1]!,
      ).load(name, "1.0.0");
      expect(await crypto.hashPolicyContent(stored)).toBe(
        await crypto.hashPolicyContent(policyBody(name)),
      );
    });

    it("rejects a proposal whose proposedContent.policyVersion has a path-traversal shape, before it can ever reach a file write", async () => {
      const { app } = buildApp();
      const name = "governance-propose-traversal-version";

      const response = await request(app)
        .post(`/policies/${name}/1.0.0/pending-changes`)
        .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`)
        .send({
          proposedContent: {
            ...policyBody(name),
            policyVersion: "../../../etc",
          },
          reason: "test proposal",
        });

      expect(response.status).toBe(400);
    });

    it.each([".", ".."])(
      "rejects a proposal whose proposedContent.policyVersion is %j with 400, before any approval (G-88)",
      async (policyVersion) => {
        const { app } = buildApp();
        const name = "governance-propose-dot-version";

        const response = await request(app)
          .post(`/policies/${name}/1.0.0/pending-changes`)
          .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`)
          .send({
            proposedContent: { ...policyBody(name), policyVersion },
            reason: "test proposal",
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('not be "." or ".."');
      },
    );

    it.each(["%2E", "%2E%2E"])(
      "rejects a proposal whose URL name is %s (a dot-only segment) with 400 (G-88)",
      async (encodedName) => {
        const { app } = buildApp();

        // supertest resolves dot segments, even percent-encoded ones,
        // before sending; a raw client does not, so send the path as is.
        const response = await rawPost(
          app,
          `/policies/${encodedName}/1.0.0/pending-changes`,
          HUMAN_MAKER_KEY,
          {
            proposedContent: policyBody("governance-propose-dot-name"),
            reason: "test proposal",
          },
        );

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('not be "." or ".."');
      },
    );

    it("fails closed (never resolves the pending change) when PolicyChangeApprovalService is not configured", async () => {
      const { executionSystem } = createInspectableExecutionSystem();
      const application = createApplication(executionSystem);

      const authenticator = new StaticKeyAuthenticator([
        {
          callerId: "human-maker",
          keyHash: hashApiKey(HUMAN_MAKER_KEY),
          credentialHolderType: AuthorityType.USER,
        },
        {
          callerId: "human-checker",
          keyHash: hashApiKey(HUMAN_CHECKER_KEY),
          credentialHolderType: AuthorityType.USER,
          stepUpPublicKey: checkerStepUpKeyPair.publicKey
            .export({ format: "pem", type: "spki" })
            .toString(),
        },
      ]);

      // Deliberately no policyChangeApprovalService -- reproduces a
      // misconfigured deployment (see app.ts's CreateAppOptions doc
      // comment on policyChangeApprovalService).
      const app = createApp(application, {
        callerAuth: {
          authenticator,
          auditSink: new InMemoryCallerAuditSink(),
        },
        stepUpVerifier: new PolicyChangeStepUpVerifier({
          nonceStore: new MemoryNonceStore(),
        }),
      });

      const name = "governance-approve-misconfigured";
      const id = await proposeChange(app, name);
      const stepUpAuthorization = await signStepUp(id, "approve");

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const response = await request(app)
          .post(`/policies/pending-changes/${id}/approve`)
          .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
          .send({ stepUpAuthorization });

        expect(response.status).toBe(500);

        const listResponse = await request(app)
          .get("/policies/pending-changes?status=PENDING_APPROVAL")
          .set("Authorization", `Bearer ${HUMAN_MAKER_KEY}`);

        expect(
          listResponse.body.changes.some(
            (change: { pendingPolicyChangeId: string }) =>
              change.pendingPolicyChangeId === id,
          ),
        ).toBe(true);
      } finally {
        consoleError.mockRestore();
      }
    });

    it("allows a distinct human checker to reject with a valid step-up envelope", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-reject-distinct-checker");

      const stepUpAuthorization = await signStepUp(id, "reject");

      const response = await request(app)
        .post(`/policies/pending-changes/${id}/reject`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({ rejectionReason: "does not meet bar", stepUpAuthorization });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("REJECTED");
      expect(response.body.resolvedBy).toBe("human-checker");
    });

    it("refuses to approve a change that was already rejected, and applies nothing", async () => {
      const { app, scratchPolicyDir, policyChangeApprovalRecordRepository } =
        buildApp();
      const name = "governance-approve-after-reject";
      const id = await proposeChange(app, name);

      const rejected = await request(app)
        .post(`/policies/pending-changes/${id}/reject`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({
          rejectionReason: "does not meet bar",
          stepUpAuthorization: await signStepUp(id, "reject"),
        });

      expect(rejected.status).toBe(200);

      const approved = await request(app)
        .post(`/policies/pending-changes/${id}/approve`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({ stepUpAuthorization: await signStepUp(id, "approve") });

      expect(approved.status).toBe(409);
      expect(
        existsSync(path.join(scratchPolicyDir, name, "1.0.0", "policy.json")),
      ).toBe(false);
      await expect(
        policyChangeApprovalRecordRepository.list(),
      ).resolves.toEqual([]);
    });

    it("lets exactly one of two concurrent approvals through, with one approval record", async () => {
      const { app, scratchPolicyDir, policyChangeApprovalRecordRepository } =
        buildApp();
      const name = "governance-concurrent-approvals";
      const id = await proposeChange(app, name);

      const [first, second] = await Promise.all(
        [0, 1].map(async () =>
          request(app)
            .post(`/policies/pending-changes/${id}/approve`)
            .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
            .send({ stepUpAuthorization: await signStepUp(id, "approve") }),
        ),
      );

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect(
        existsSync(path.join(scratchPolicyDir, name, "1.0.0", "policy.json")),
      ).toBe(true);

      const records = await policyChangeApprovalRecordRepository.list();
      expect(records).toHaveLength(1);
      expect(records[0].pendingPolicyChangeId).toBe(id);
    });

    it("denies a replayed (reused) step-up envelope on a second approval attempt", async () => {
      const { app } = buildApp();
      const id = await proposeChange(app, "governance-approve-replay");

      const stepUpAuthorization = await signStepUp(id, "approve");

      const first = await request(app)
        .post(`/policies/pending-changes/${id}/approve`)
        .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
        .send({ stepUpAuthorization });

      expect(first.status).toBe(200);

      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        const second = await request(app)
          .post(`/policies/pending-changes/${id}/approve`)
          .set("Authorization", `Bearer ${HUMAN_CHECKER_KEY}`)
          .send({ stepUpAuthorization });

        expect(second.status).toBe(403);
        expect(second.body.code).toBe("STEP_UP_AUTHORIZATION_INVALID");
        expect(second.body.checks).toBeUndefined();
        expect(loggedChecks(consoleError)).toMatchObject({
          nonceUnseen: false,
        });
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});

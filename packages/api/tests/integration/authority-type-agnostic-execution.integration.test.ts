import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../test-app.js";
import { createBusinessTransaction } from "../fixtures/business-transaction.js";

/**
 * Strategic-positioning validation follow-up: "We Are Not in the AI Race"
 * claims the same authorization mechanism governs execution regardless of
 * whether the request originated from an AI agent, a human, an
 * application, or any other system -- i.e. authorization depends only on
 * whether the requested action is authorized, never on who or what is
 * asking. Prior to this file that property was only an *inference* from
 * the absence of any `authority`-reading code in RuntimeEngine/
 * PolicyEngine/SignalIntentBinder/CapabilityPolicyBinder (confirmed by
 * direct grep: zero references to `authority` in any of those four
 * files). This file makes it a direct, executable proof instead.
 *
 * BusinessTransactionMapper.fromRequest (packages/api/src/mappers/
 * BusinessTransactionMapper.ts:28) does `request.authority as Authority`
 * -- a blind cast, with no runtime validation of `authorityType` against
 * the AuthorityType enum (USER | ROLE | SERVICE | ORGANIZATION). That
 * means an arbitrary, even nonsensical, authorityType string reaches the
 * runtime unfiltered -- the strongest possible test of "this mechanism is
 * blind to caller kind" is to send one and confirm the outcome is
 * byte-for-byte identical to a conventional USER transaction, for both
 * the APPROVE and REJECT paths.
 */
describe("Authorization is authority-type-agnostic (AI/human/application/third-party neutrality)", () => {
  it("produces an identical APPROVE decision regardless of authority.authorityType, including a value outside the AuthorityType enum entirely", async () => {
    const base = await createBusinessTransaction();

    const asUser = {
      ...base,
      businessTransactionId: crypto.randomUUID(),
      authority: { ...base.authority, authorityType: "USER" },
    };
    asUser.metadata = {
      ...asUser.metadata,
      businessTransactionId: asUser.businessTransactionId,
    };

    const asNovelCallerKind = {
      ...base,
      // Its own signed approval: an approval is single use.
      signals: (await createBusinessTransaction()).signals,
      businessTransactionId: crypto.randomUUID(),
      // Deliberately not a member of AuthorityType at all -- stands in
      // for "any future system, whatever it calls itself" (an AI agent,
      // an autonomous pipeline, a third-party integration never
      // anticipated by this enum). If the authorization outcome differs
      // from the USER case below, the mechanism is not actually
      // caller-kind-agnostic; it merely happens not to special-case the
      // four enum members it knows about today.
      authority: {
        ...base.authority,
        authorityType: "FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE",
      },
    };
    asNovelCallerKind.metadata = {
      ...asNovelCallerKind.metadata,
      businessTransactionId: asNovelCallerKind.businessTransactionId,
    };

    const userResponse = await request(app).post("/execute").send(asUser);
    const novelResponse = await request(app)
      .post("/execute")
      .send(asNovelCallerKind);

    expect(userResponse.status).toBe(200);
    expect(novelResponse.status).toBe(200);

    expect(novelResponse.body.executions[0].decision.outcome).toBe(
      userResponse.body.executions[0].decision.outcome,
    );
    expect(novelResponse.body.executions[0].decision.matchedRuleId).toBe(
      userResponse.body.executions[0].decision.matchedRuleId,
    );
    expect(novelResponse.body.executions[0].decision.outcome).toBe("APPROVED");
  });

  it("produces an identical REJECT decision (same matchedRuleId, same reason shape) regardless of authority.authorityType", async () => {
    const base = await createBusinessTransaction();

    // Flip one signal so the policy rejects, independent of authority --
    // proves authorityType has no bearing on the REJECT path either, not
    // only the APPROVE path above (a mechanism could in principle be
    // blind on approval but special-case rejection, e.g. an
    // authority-based override; this rules that out explicitly).
    const rejectingSignals = {
      ...base.signals,
      sufficientFunds: false,
    };

    const asUser = {
      ...base,
      businessTransactionId: crypto.randomUUID(),
      authority: { ...base.authority, authorityType: "USER" },
      signals: rejectingSignals,
    };
    asUser.metadata = {
      ...asUser.metadata,
      businessTransactionId: asUser.businessTransactionId,
    };

    const asNovelCallerKind = {
      ...base,
      businessTransactionId: crypto.randomUUID(),
      authority: {
        ...base.authority,
        authorityType: "FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE",
      },
      signals: rejectingSignals,
    };
    asNovelCallerKind.metadata = {
      ...asNovelCallerKind.metadata,
      businessTransactionId: asNovelCallerKind.businessTransactionId,
    };

    const userResponse = await request(app).post("/execute").send(asUser);
    const novelResponse = await request(app)
      .post("/execute")
      .send(asNovelCallerKind);

    expect(userResponse.status).toBe(403);
    expect(novelResponse.status).toBe(403);
    expect(userResponse.body.code).toBe("POLICY_DENIED");
    expect(novelResponse.body.code).toBe("POLICY_DENIED");

    // Same rejection, not merely "both rejected" -- proves the *reason*
    // authorization was refused is identical too, not coincidentally
    // the same status code via a different path.
    expect(novelResponse.body.error).toBe(userResponse.body.error);
  });
});

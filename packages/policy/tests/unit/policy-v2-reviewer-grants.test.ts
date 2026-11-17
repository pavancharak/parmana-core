import { describe, expect, it } from "vitest";

import { ReviewQueue } from "../../src/v2/review.js";
import {
  PolicyRegister,
  RegisterError,
  type Person,
} from "../../src/v2/register.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const CAP = "erp:pay-invoice";
const OWNER: Person = { id: "owner-1", roles: ["parmana-owner"] };
const ACTION_OWNER: Person = { id: "action-1", roles: [] };

/** A register with an action, two named reviewers, and reviewer roles granted to both. */
function registerWithReviewers(): PolicyRegister {
  const r = new PolicyRegister(() => NOW);
  r.bootstrapOwner(OWNER.id);
  r.grantRole(OWNER, ACTION_OWNER.id, "action-owner");
  r.grantRole(OWNER, "rev-1", "reviewer");
  r.grantRole(OWNER, "rev-2", "reviewer");
  r.registerAction(
    {
      capability: CAP,
      owner: ACTION_OWNER.id,
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    OWNER,
  );
  return r;
}

describe("granting a review", () => {
  it("lets the action owner grant a named reviewer who holds the reviewer role", () => {
    const r = registerWithReviewers();
    const grant = r.grantReview(CAP, "rev-1", ACTION_OWNER);
    expect(grant.status).toBe("active");
    expect(r.activeReviewGrants().map((g) => g.reviewerId)).toEqual(["rev-1"]);
  });

  it("lets the Parmana owner grant a review too", () => {
    const r = registerWithReviewers();
    expect(r.grantReview(CAP, "rev-2", OWNER).status).toBe("active");
  });

  it("refuses a grant from anyone else", () => {
    const r = registerWithReviewers();
    expect(() =>
      r.grantReview(CAP, "rev-1", { id: "rev-2", roles: [] }),
    ).toThrow(/Only the action owner/);
  });

  it("refuses a reviewer who is not named on the action", () => {
    const r = registerWithReviewers();
    r.grantRole(OWNER, "stranger", "reviewer");
    expect(() => r.grantReview(CAP, "stranger", ACTION_OWNER)).toThrow(
      /not a named reviewer/,
    );
  });

  it("refuses a reviewer who does not hold the reviewer role", () => {
    const r = registerWithReviewers();
    expect(() => r.grantReview(CAP, "rev-3", ACTION_OWNER)).toThrow(
      /no reviewer role/,
    );
  });

  it("refuses the action's owner or successor as a reviewer", () => {
    const r = new PolicyRegister(() => NOW);
    r.bootstrapOwner(OWNER.id);
    r.grantRole(OWNER, ACTION_OWNER.id, "action-owner");
    r.grantRole(OWNER, "action-2", "reviewer");
    r.registerAction(
      {
        capability: CAP,
        owner: ACTION_OWNER.id,
        successor: "action-2",
        reviewers: ["action-2"],
        review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
      },
      OWNER,
    );
    expect(() => r.grantReview(CAP, "action-2", ACTION_OWNER)).toThrow(
      /cannot review/,
    );
  });

  it("refuses an amount limit that is not positive", () => {
    const r = registerWithReviewers();
    expect(() => r.grantReview(CAP, "rev-1", ACTION_OWNER, 0)).toThrow(
      RegisterError,
    );
  });

  it("keeps an amount limit on the grant", () => {
    const r = registerWithReviewers();
    expect(r.grantReview(CAP, "rev-1", ACTION_OWNER, 5000).maxAmount).toBe(
      5000,
    );
  });
});

describe("revoking and losing a review", () => {
  it("revokes at once, with a reason, by the action owner", () => {
    const r = registerWithReviewers();
    r.grantReview(CAP, "rev-1", ACTION_OWNER);
    expect(() => r.revokeReview(CAP, "rev-1", ACTION_OWNER, " ")).toThrow(
      /reason/,
    );
    expect(() =>
      r.revokeReview(CAP, "rev-1", { id: "rev-2", roles: [] }, "lost"),
    ).toThrow(/Only the action owner/);
    expect(
      r.revokeReview(CAP, "rev-1", ACTION_OWNER, "left the team").status,
    ).toBe("revoked");
    expect(r.activeReviewGrants()).toEqual([]);
  });

  it("stops counting a grant when the reviewer loses the reviewer role", () => {
    const r = registerWithReviewers();
    r.grantReview(CAP, "rev-1", ACTION_OWNER);
    r.revokeRole(OWNER, "rev-1", "reviewer");
    expect(r.activeReviewGrants()).toEqual([]);
    expect(r.listReviewGrants()).toHaveLength(1);
  });

  it("keeps grants through a snapshot and a load, and reads an older snapshot as none", () => {
    const r = registerWithReviewers();
    r.grantReview(CAP, "rev-1", ACTION_OWNER, 100);
    const restored = new PolicyRegister(() => NOW);
    restored.load(JSON.parse(JSON.stringify(r.snapshot())));
    expect(restored.activeReviewGrants()[0]?.maxAmount).toBe(100);

    const older = {
      ...r.snapshot(),
      reviewGrants: undefined,
    } as unknown as ReturnType<PolicyRegister["snapshot"]>;
    const fromOlder = new PolicyRegister(() => NOW);
    fromOlder.load(older);
    expect(fromOlder.listReviewGrants()).toEqual([]);
  });
});

describe("the review queue reads the register's grants", () => {
  it("replaces the queue's grants with the given ones, and no others", () => {
    const queue = new ReviewQueue(() => NOW);
    queue.grant("setup", { reviewerId: "old", capability: CAP });
    queue.replaceGrants([{ reviewerId: "rev-1", capability: CAP }]);
    const grants = queue.snapshot().grants;
    expect(grants.map((g) => g.reviewerId)).toEqual(["rev-1"]);
    expect(grants[0]?.revoked).toBe(false);
  });
});

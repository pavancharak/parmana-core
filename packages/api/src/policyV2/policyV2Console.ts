import { policyV2 } from "@parmana/policy";

import { PolicyV2ForbiddenError } from "./policyV2Register.js";

/**
 * The governance console, served as HTML. A caller sees a screen only if its roles allow it, and
 * the console checks that before anything is read. The roles come from the register, never from
 * the request. The console is read-only.
 */

export type ConsoleScreenName = policyV2.console.Screen;

/** The part of the state store the console reads. The Postgres store satisfies it. */
export interface PolicyV2ConsoleStateStore {
  load<T>(
    component: "register" | "review" | "alerts",
  ): Promise<{ readonly body: T; readonly version: number } | undefined>;
  readEvidence(): Promise<policyV2.evidence.EvidenceRecord[]>;
  readAuditPage(
    component: "register",
    options: { readonly after: number; readonly limit: number },
  ): Promise<policyV2.persistence.StoredAuditRow[]>;
}

/** The screens the console serves. Anything else is not a screen. */
export const CONSOLE_SCREENS: readonly ConsoleScreenName[] = [
  "home",
  "register",
  "changes",
  "reviews",
  "approvals",
  "gate",
  "decisions",
  "audit",
];

export class PolicyV2ConsoleService {
  constructor(
    private readonly options: {
      readonly store: PolicyV2ConsoleStateStore;
      readonly now?: () => Date;
    },
  ) {}

  /**
   * Renders one screen for the caller. Throws PolicyV2ForbiddenError if the caller holds no
   * register role, and the console's own error if its roles do not allow this screen.
   */
  async render(
    callerId: string,
    screen: ConsoleScreenName,
    capability?: string,
  ): Promise<string> {
    const clock = this.options.now ?? (() => new Date());
    const store = this.options.store;

    const registerState =
      await store.load<policyV2.register.RegisterSnapshot>("register");
    const register = new policyV2.register.PolicyRegister(clock);
    if (registerState !== undefined) register.load(registerState.body);
    const roles = register.rolesOf(callerId);
    if (roles.length === 0) {
      throw new PolicyV2ForbiddenError("The caller holds no register role.");
    }

    const reviewState =
      await store.load<policyV2.review.ReviewSnapshot>("review");
    const reviews = new policyV2.review.ReviewQueue(clock);
    if (reviewState !== undefined) reviews.load(reviewState.body);
    const alertState =
      await store.load<policyV2.alerts.AlertSnapshot>("alerts");
    const alerts = new policyV2.alerts.AlertBoard(
      clock,
      () => true,
      () => true,
    );
    if (alertState !== undefined) alerts.load(alertState.body);
    const evidence = new policyV2.evidence.EvidenceLog();
    evidence.load(await store.readEvidence());
    const audit = await store.readAuditPage("register", {
      after: 0,
      limit: 500,
    });

    const uses =
      capability === undefined
        ? undefined
        : register.usesOfApproved(capability);
    const viewer = {
      id: callerId,
      roles: roles as policyV2.console.ConsoleRole[],
    };
    return policyV2.render.renderScreen(
      screen,
      viewer,
      {
        register,
        reviews,
        alerts,
        evidence,
        audit: () =>
          audit.map((row) => ({
            at: row.at,
            by: row.by,
            event: row.event,
            detail: row.detail,
          })),
      },
      {
        ...(capability !== undefined ? { capability } : {}),
        ...(uses !== undefined
          ? { usedSources: uses.sources, usedThresholds: uses.thresholds }
          : {}),
      },
    );
  }
}

/**
 * The governance console's screens, as data (design: GOVERNANCE-CONSOLE-DESIGN, sections 2 and 3).
 *
 * Each screen is a function that checks the permission table before it returns
 * anything. A role that is not allowed a screen gets an error, not an empty list.
 * The screens are read-only views of the register, the review queue, the alert
 * board and the evidence log. They change nothing. The rendering is not built here.
 *
 * Standalone. Nothing calls this from the runtime, and no caller has access.
 */

import type {
  ActionRecord,
  PolicyRegister,
  SourceRecord,
  ThresholdRecord,
} from "./register.js";
import type { ReviewItem, ReviewQueue } from "./review.js";
import type { AlertBoard, Alert } from "./alerts.js";
import type { EvidenceLog, EvidenceRecord } from "./evidence.js";

export type ConsoleRole =
  | "action-owner"
  | "second-approver"
  | "risk-function"
  | "source-owner"
  | "reviewer"
  | "approver"
  | "parmana-owner"
  | "gate-owner"
  | "operator"
  | "auditor";

export interface Viewer {
  readonly id: string;
  readonly roles: readonly ConsoleRole[];
}

export type Screen =
  | "home"
  | "register"
  | "changes"
  | "reviews"
  | "approvals"
  | "gate"
  | "decisions"
  | "audit";

/** Who may open each screen. Callers have no entry: they never reach the console. */
export const SCREEN_ACCESS: Readonly<Record<Screen, readonly ConsoleRole[]>> = {
  home: [
    "action-owner",
    "second-approver",
    "risk-function",
    "source-owner",
    "reviewer",
    "approver",
    "parmana-owner",
    "gate-owner",
    "operator",
    "auditor",
  ],
  register: [
    "action-owner",
    "second-approver",
    "risk-function",
    "source-owner",
    "parmana-owner",
    "gate-owner",
    "operator",
    "auditor",
  ],
  changes: [
    "action-owner",
    "second-approver",
    "risk-function",
    "source-owner",
    "parmana-owner",
  ],
  reviews: ["reviewer", "parmana-owner", "operator", "auditor"],
  approvals: ["approver"],
  gate: ["gate-owner", "parmana-owner", "operator", "auditor"],
  decisions: [
    "action-owner",
    "source-owner",
    "reviewer",
    "parmana-owner",
    "operator",
    "auditor",
  ],
  audit: ["auditor"],
};

export class ConsoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConsoleError";
  }
}

/** Throws if the viewer may not open the screen. Exported so every renderer checks access the same way. */
export function requireScreen(viewer: Viewer, screen: Screen): void {
  if (!viewer.roles.some((role) => SCREEN_ACCESS[screen].includes(role))) {
    throw new ConsoleError(`${viewer.id} may not open the ${screen} screen.`);
  }
}

export interface ChangeRow {
  readonly kind: "source" | "threshold";
  readonly name: string;
  readonly proposedBy: string;
  /** What is still needed before the change takes effect, in plain words. */
  readonly awaiting: readonly string[];
}

export interface GateRow {
  readonly item: string;
  readonly done: boolean;
}

export interface DecisionRow {
  readonly recordId: string;
  readonly decidedAt: string;
  readonly capability: string;
  readonly target: string;
  readonly outcome: string;
  readonly matchedRuleId?: string;
  readonly tier?: string;
  readonly policyHash: string;
}

export interface ReviewRow {
  readonly id: string;
  readonly capability: string;
  readonly target: string;
  readonly status: string;
  readonly dueAt: string;
  readonly highValue: boolean;
  readonly canDecide: boolean;
  readonly decidedBy: readonly string[];
  readonly view: ReviewItem["view"];
  readonly reason: string;
}

/** The sources of the console: the register, the review queue, the alert board and the evidence log. */
export interface ConsoleSources {
  readonly register: PolicyRegister;
  readonly reviews: ReviewQueue;
  readonly alerts: AlertBoard;
  readonly evidence: EvidenceLog;
  readonly audit: () => readonly {
    at: string;
    by: string;
    event: string;
    detail: string;
  }[];
}

export function registerScreen(
  viewer: Viewer,
  src: ConsoleSources,
): {
  sources: readonly SourceRecord[];
  thresholds: readonly ThresholdRecord[];
  actions: readonly ActionRecord[];
} {
  requireScreen(viewer, "register");
  return {
    sources: src.register.listSources(),
    thresholds: src.register.listThresholds(),
    actions: src.register.listActions(),
  };
}

/** Pending sources and proposed thresholds, with what each still needs. */
export function changesScreen(
  viewer: Viewer,
  src: ConsoleSources,
): ChangeRow[] {
  requireScreen(viewer, "changes");
  const rows: ChangeRow[] = [];
  for (const source of src.register.listSources()) {
    if (source.status !== "pending") continue;
    const awaiting: string[] = [];
    if (!source.approvals.some((a) => a.role === "second-approver"))
      awaiting.push("a second approver");
    const needsOwner =
      source.canApprove || source.signer.kind === "intermediary";
    if (needsOwner && !source.approvals.some((a) => a.role === "parmana-owner"))
      awaiting.push("the Parmana owner's sign-off");
    rows.push({
      kind: "source",
      name: source.name,
      proposedBy: source.proposedBy,
      awaiting,
    });
  }
  for (const threshold of src.register.listThresholds()) {
    if (threshold.status !== "proposed") continue;
    const awaiting: string[] = [];
    if (!threshold.approvals.some((a) => a.role === "second-approver"))
      awaiting.push("a second approver");
    if (
      threshold.highValue &&
      !threshold.approvals.some((a) => a.role === "risk-function")
    )
      awaiting.push("the risk function");
    rows.push({
      kind: "threshold",
      name: `${threshold.action}/${threshold.name}`,
      proposedBy: threshold.proposedBy,
      awaiting,
    });
  }
  return rows;
}

/** The review queue. A reviewer sees the items they may decide, with the exact view and a flag for each. */
export function reviewsScreen(
  viewer: Viewer,
  src: ConsoleSources,
): ReviewRow[] {
  requireScreen(viewer, "reviews");
  return src.reviews.listItems().map((item) => ({
    id: item.id,
    capability: item.capability,
    target: item.target,
    status: item.status,
    dueAt: item.dueAt,
    highValue: item.highValue,
    canDecide: src.reviews.canReview(item.id, viewer.id),
    decidedBy: item.decisions.map((d) => d.reviewerId),
    view: item.view,
    reason: item.reason,
  }));
}

/** The go-live checklist for one action. The gate owner signs off on it; this only shows it. */
export function gateScreen(
  viewer: Viewer,
  src: ConsoleSources,
  capability: string,
  usedSources: readonly string[],
  usedThresholds: readonly string[],
): GateRow[] {
  requireScreen(viewer, "gate");
  const missing = src.register.gateMissing(
    capability,
    usedSources,
    usedThresholds,
  );
  const rows: GateRow[] = missing.map((item) => ({ item, done: false }));
  if (missing.length === 0)
    rows.push({ item: "every item is in place", done: true });
  return rows;
}

/** Recorded decisions, most recent last. The list shows outcomes; the full record is opened separately. */
export function decisionsScreen(
  viewer: Viewer,
  src: ConsoleSources,
): DecisionRow[] {
  requireScreen(viewer, "decisions");
  return src.evidence.all().map((record: EvidenceRecord) => ({
    recordId: record.recordId,
    decidedAt: record.decidedAt,
    capability: record.request.capability,
    target: record.request.target,
    outcome: record.decision.outcome,
    ...(record.decision.matchedRuleId !== undefined && {
      matchedRuleId: record.decision.matchedRuleId,
    }),
    ...(record.decision.tier !== undefined && { tier: record.decision.tier }),
    policyHash: record.policyHash,
  }));
}

/** The audit log across the register, reviews, alerts and evidence. Read only, for auditors. */
export function auditScreen(
  viewer: Viewer,
  src: ConsoleSources,
): readonly { at: string; by: string; event: string; detail: string }[] {
  requireScreen(viewer, "audit");
  return [...src.audit()].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
}

/** The home screen: what needs this viewer now, and what is blocked. */
export function homeScreen(
  viewer: Viewer,
  src: ConsoleSources,
): {
  alerts: readonly Alert[];
  reviews: readonly ReviewRow[];
  changes: readonly ChangeRow[];
  blocked: readonly { capability: string; missing: readonly string[] }[];
} {
  requireScreen(viewer, "home");
  const canSeeReviews = viewer.roles.some((r) =>
    SCREEN_ACCESS.reviews.includes(r),
  );
  const reviews = canSeeReviews ? reviewsScreen(viewer, src) : [];
  const changes = viewer.roles.some((r) => SCREEN_ACCESS.changes.includes(r))
    ? changesScreen(viewer, src)
    : [];
  // Blocked actions: those not yet live, with what the register can say without the sources and thresholds a policy uses.
  const blocked = src.register
    .listActions()
    .filter((action) => !action.live)
    .map((action) => ({
      capability: action.capability,
      missing: src.register.gateMissing(action.capability, [], []),
    }));
  return {
    alerts: src.alerts.visibleFor({ id: viewer.id, roles: viewer.roles }),
    reviews: reviews.filter((row) => row.canDecide),
    changes,
    blocked,
  };
}

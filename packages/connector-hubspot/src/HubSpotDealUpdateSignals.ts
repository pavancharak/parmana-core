import type { PolicySignals } from "@parmana/policy";

import type { HubSpotDeal } from "./HubSpotTypes.js";

/**
 * Default forward-only stage order for HubSpot's out-of-the-box "Sales
 * Pipeline". A transition is allowed when it moves strictly forward
 * through this list, or into HUBSPOT_LOST_STAGE from any non-terminal
 * stage (a deal can be marked lost from anywhere in the funnel).
 * Backward transitions, and any transition out of a terminal stage
 * (closedwon/closedlost), are never allowed.
 *
 * OPEN DECISION (deliberately not resolved this milestone — see
 * docs/CLAIMS.md): this is one GLOBAL stage order, not configured
 * per-pipeline. A HubSpot account with multiple pipelines (each with its
 * own stage ids and ordering) is not represented — a proposedDealStage
 * that happens to share a stage id with this default order is evaluated
 * against it regardless of which pipeline the deal actually belongs to.
 * Per-pipeline configuration (keying this map by the deal's own
 * `pipeline` property) is real future work, not implemented here.
 */
export const HUBSPOT_DEFAULT_STAGE_ORDER: readonly string[] = Object.freeze([
  "appointmentscheduled",
  "qualifiedtobuy",
  "presentationscheduled",
  "decisionmakerboughtin",
  "contractsent",
  "closedwon",
]);

export const HUBSPOT_LOST_STAGE = "closedlost";

/** Default amount-change threshold (in the deal's own currency units) above which pre-authorization is required. */
export const HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD = 10_000;

/**
 * Forward-only-through-the-pipeline transition rule, plus an explicit
 * allowance for moving to the lost stage from any active stage. Returns
 * false for any stage (current or proposed) not present in stageOrder,
 * other than the fixed HUBSPOT_LOST_STAGE target — an unrecognized
 * stage id is never assumed to be a valid forward move.
 */
export function isHubSpotStageTransitionAllowed(
  currentStage: string,
  proposedStage: string,
  stageOrder: readonly string[] = HUBSPOT_DEFAULT_STAGE_ORDER,
): boolean {
  if (currentStage === proposedStage) return true;

  const terminalStage = stageOrder[stageOrder.length - 1];
  const currentIsTerminal =
    currentStage === HUBSPOT_LOST_STAGE || currentStage === terminalStage;

  if (proposedStage === HUBSPOT_LOST_STAGE) {
    return !currentIsTerminal && stageOrder.includes(currentStage);
  }

  if (currentIsTerminal) return false;

  const currentIndex = stageOrder.indexOf(currentStage);
  const proposedIndex = stageOrder.indexOf(proposedStage);
  if (currentIndex === -1 || proposedIndex === -1) return false;

  return proposedIndex > currentIndex;
}

export interface BuildHubSpotDealUpdateSignalsInput {
  readonly currentDeal: HubSpotDeal;
  readonly proposedDealStage?: string;
  readonly proposedAmount?: number;
  /**
   * Caller-declared signal indicating an amount change above threshold
   * was pre-authorized out-of-band. This milestone does not implement
   * how that pre-authorization is itself obtained or verified (e.g. a
   * separately signed approval artifact) — see docs/CLAIMS.md. Absent,
   * this defaults to false, which is the safe default: an over-threshold
   * amount change is denied unless explicitly declared pre-authorized.
   */
  readonly preAuthorizedForAmountChange?: boolean;
  readonly amountChangeThreshold?: number;
  readonly stageOrder?: readonly string[];
}

/**
 * Assembles the runtime signals the hubspot-deal-update policy
 * evaluates. Arithmetic (amount delta, threshold comparison) and the
 * stage-transition-allowlist lookup happen here, not inside
 * PolicyEngine's OperatorEvaluator, which only compares a single fact
 * against a literal value and has no fact-to-fact arithmetic or
 * allowlist lookup.
 *
 * proposedDealStage/proposedAmount are only included in the returned
 * signals when the caller actually supplied them, left undefined
 * otherwise — this mirrors exactly what parameters.dealstage/
 * parameters.amount will be on the real Intent, which is required for
 * this policy's boundSignals check (SignalIntentBinder) to compare
 * like-for-like rather than a default value against a genuinely absent
 * Intent field.
 */
export function buildHubSpotDealUpdateSignals(
  input: BuildHubSpotDealUpdateSignalsInput,
): PolicySignals {
  const currentDealStage = input.currentDeal.properties.dealstage ?? "";
  const currentAmount =
    input.currentDeal.properties.amount !== undefined
      ? Number(input.currentDeal.properties.amount)
      : undefined;

  const dealStageChangeRequested =
    input.proposedDealStage !== undefined &&
    input.proposedDealStage !== currentDealStage;
  const dealStageTransitionAllowed = !dealStageChangeRequested
    ? true
    : isHubSpotStageTransitionAllowed(
        currentDealStage,
        input.proposedDealStage as string,
        input.stageOrder,
      );

  const amountChangeRequested =
    input.proposedAmount !== undefined &&
    input.proposedAmount !== currentAmount;
  const amountDeltaAbs = amountChangeRequested
    ? Math.abs((input.proposedAmount as number) - (currentAmount ?? 0))
    : 0;
  const threshold =
    input.amountChangeThreshold ?? HUBSPOT_DEFAULT_AMOUNT_CHANGE_THRESHOLD;
  const amountChangeExceedsThreshold =
    amountChangeRequested && amountDeltaAbs > threshold;

  return {
    currentDealStage,
    ...(input.proposedDealStage !== undefined
      ? { proposedDealStage: input.proposedDealStage }
      : {}),
    dealStageChangeRequested,
    dealStageTransitionAllowed,
    amountChangeRequested,
    ...(input.proposedAmount !== undefined
      ? { proposedAmount: input.proposedAmount }
      : {}),
    amountDeltaAbs,
    amountChangeExceedsThreshold,
    preAuthorizedForAmountChange: input.preAuthorizedForAmountChange ?? false,
  };
}

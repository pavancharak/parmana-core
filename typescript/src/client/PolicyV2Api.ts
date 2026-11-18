/**
 * Parmana TypeScript SDK
 *
 * Policy version 2 API.
 *
 * Decide an action under policy version 2, and read or decide the review
 * items that a decision can open. Nothing here releases an action: a decision
 * records the outcome and reports released: false.
 */

import type { Transport } from "../config/Transport.js";

import type {
  PolicyV2Decision,
  PolicyV2DecisionRequest,
  PolicyV2ReviewDecision,
  PolicyV2ReviewDecisionValue,
  PolicyV2ReviewView,
} from "../models/policy-v2.js";

export class PolicyV2Api {
  constructor(private readonly transport: Transport) {}

  /**
   * Runs and records a decision under policy version 2. Maps to
   * POST /v2/decisions. The caller must be authenticated.
   */
  public async decide(
    request: PolicyV2DecisionRequest,
  ): Promise<PolicyV2Decision> {
    const response = await this.transport.send<PolicyV2Decision>({
      method: "POST",
      path: "/v2/decisions",
      body: request,
    });

    return response.body;
  }

  /**
   * The status of a review item, for the requester who asked for it. Maps to
   * GET /v2/reviews/{itemId}. Any other caller gets 404.
   */
  public async review(itemId: string): Promise<PolicyV2ReviewView> {
    const response = await this.transport.send<PolicyV2ReviewView>({
      method: "GET",
      path: `/v2/reviews/${encodeURIComponent(itemId)}`,
    });

    return response.body;
  }

  /**
   * A reviewer approves or rejects a review item. Maps to
   * POST /v2/reviews/{itemId}/decision. The reviewer must hold an active grant
   * for the item's action.
   */
  public async decideReview(
    itemId: string,
    decision: PolicyV2ReviewDecisionValue,
  ): Promise<PolicyV2ReviewDecision> {
    const response = await this.transport.send<PolicyV2ReviewDecision>({
      method: "POST",
      path: `/v2/reviews/${encodeURIComponent(itemId)}/decision`,
      body: { decision },
    });

    return response.body;
  }
}

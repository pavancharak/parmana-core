import type { ReplayRequest } from "../types/ReplayRequest.js";

import type { ReplayPlan } from "../types/ReplayPlan.js";

export class ReplayExecutor {
  execute(plan: ReplayPlan, _request: ReplayRequest) {
    const executionOrder = plan.executionIds;

    return {
      executionIds: executionOrder,

      executionOrder,
    };
  }
}

import type {
  BusinessTransaction,
  ExecutionTrustRecord,
} from "@parmana/shared";

import type { Runtime } from "@parmana/runtime";
import { withDemoApproval } from "../../shared/helpers/demo-approval.js";

/**
 * Example application service.
 *
 * Applications should integrate Parmana
 * behind a business-oriented service rather
 * than calling the Runtime directly from
 * controllers, routes, or UI code.
 */
export class PaymentService {
  constructor(private readonly runtime: Runtime) {}

  /**
   * Releases a vendor payment through
   * the Parmana Runtime.
   */
  async releasePayment(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    const { trustRecord } = await this.runtime.execute(
      await withDemoApproval(transaction),
    );

    return trustRecord;
  }
}

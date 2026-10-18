import { RuntimeContext } from "../context/RuntimeContext.js";
import type { RuntimeComponent } from "../RuntimeComponent.js";
import { ReceiptService } from "../services/receipt-service.js";

/**
 * Receipt Component.
 *
 * Not currently wired as a RuntimeBuilder pipeline stage — RuntimeFactory
 * only adds TrustChainValidationComponent and ExecutionComponent
 * (packages/runtime/src/RuntimeFactory.ts). Live receipt generation
 * happens instead via ExecutionTrustApplication.execute()'s own direct
 * `this.receipts.generate(...)` call, after verification succeeds
 * (packages/runtime/src/ExecutionTrustApplication.ts), which is what
 * ReceiptService.generate() (below) actually implements and what
 * receipt.integration.test.ts / receipt-hybrid.integration.test.ts
 * exercise. This class remains exported from @parmana/runtime's public
 * surface (packages/runtime/src/index.ts) for external composition, but
 * is not itself on the production request path (docs/VERIFICATION-GAPS.md
 * G-26).
 */
export class ReceiptComponent implements RuntimeComponent {
  constructor(private readonly receiptService: ReceiptService) {
    Object.freeze(this);
  }

  public async execute(context: RuntimeContext): Promise<RuntimeContext> {
    const receipt = await this.receiptService.generate(
      context.transaction.businessTransactionId,
    );

    return {
      ...context,
      receipt,
    };
  }
}

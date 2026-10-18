import type { RuntimeContext } from "./context/RuntimeContext.js";

/**
 * Runtime Component.
 *
 * Performs one deterministic transformation of the
 * RuntimeContext.
 *
 * Components:
 * - never mutate the input
 * - return a new RuntimeContext
 * - may append execution artifacts
 * - may throw on validation failure
 */
export interface RuntimeComponent {
  /**
   * Execute one runtime stage.
   */
  execute(context: RuntimeContext): Promise<RuntimeContext>;
}

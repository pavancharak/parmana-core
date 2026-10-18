import type { RuntimeContext } from "./context/RuntimeContext.js";
import type { RuntimeComponent } from "./RuntimeComponent.js";

/**
 * Canonical Runtime Pipeline.
 *
 * Executes RuntimeComponents sequentially.
 *
 * Pipeline guarantees:
 * - deterministic execution order
 * - immutable RuntimeContext
 * - no component reordering
 * - fail-fast execution
 */
export class RuntimePipeline {
  private readonly components: readonly RuntimeComponent[];

  constructor(components: readonly RuntimeComponent[]) {
    this.components = [...components];

    Object.freeze(this.components);
    Object.freeze(this);
  }

  /**
   * Execute the complete runtime pipeline.
   */
  public async execute(context: RuntimeContext): Promise<RuntimeContext> {
    let current = context;

    for (const component of this.components) {
      current = await component.execute(current);
    }

    return current;
  }

  /**
   * Returns the configured components.
   */
  public getComponents(): readonly RuntimeComponent[] {
    return this.components;
  }

  /**
   * Number of pipeline stages.
   */
  public size(): number {
    return this.components.length;
  }

  /**
   * True if no components are configured.
   */
  public isEmpty(): boolean {
    return this.components.length === 0;
  }
}

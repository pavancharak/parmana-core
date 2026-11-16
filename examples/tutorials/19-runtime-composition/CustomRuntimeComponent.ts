import type { RuntimeComponent, RuntimeContext } from "@parmana/runtime";

/**
 * Demonstrates a reusable Runtime Component.
 *
 * Runtime Components participate in execution,
 * unlike Runtime Hooks which are observational.
 */
export class CustomRuntimeComponent implements RuntimeComponent {
  async execute(context: RuntimeContext): Promise<RuntimeContext> {
    console.log("[Component] Enriching execution metadata.");

    if (context.execution === undefined) {
      throw new Error(
        "CustomRuntimeComponent runs after the execution is recorded.",
      );
    }

    Object.assign(context.execution, {
      metadata: {
        ...context.execution.metadata,
        tutorial: "19-runtime-composition",
        processedBy: "CustomRuntimeComponent",
      },
    });

    return context;
  }
}

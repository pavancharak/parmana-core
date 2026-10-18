import type { RuntimeComponent } from "@parmana/runtime";

import type { RuntimeContext } from "@parmana/runtime";

/**
 * Pipeline Metrics Component.
 *
 * Demonstrates collecting runtime metrics
 * without modifying the runtime.
 */
export class MetricsComponent implements RuntimeComponent {
  public async execute(context: RuntimeContext): Promise<RuntimeContext> {
    const started = performance.now();

    console.log();

    console.log("========================================");

    console.log(" Pipeline Stage: Metrics");

    console.log("========================================");

    console.log();

    console.log("Recording runtime metrics...");

    console.log();

    console.log(`Decision Outcome : ${context.decision.outcome}`);

    console.log();

    const elapsed = performance.now() - started;

    console.log(`Stage Duration : ${elapsed.toFixed(3)} ms`);

    console.log();

    return context;
  }
}

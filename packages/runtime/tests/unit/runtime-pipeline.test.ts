import { describe, expect, it } from "vitest";

import { RuntimePipeline } from "../../src/RuntimePipeline.js";
import type { RuntimeComponent } from "../../src/RuntimeComponent.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

function stage(mark: string): RuntimeComponent {
  return {
    async execute(context: RuntimeContext): Promise<RuntimeContext> {
      return {
        ...context,
        transaction: {
          ...context.transaction,
          metadata: {
            ...context.transaction.metadata,
            [mark]: true,
          },
        },
      };
    },
  };
}

const baseContext = {
  transaction: {
    businessTransactionId: "txn-1",
    metadata: {},
  },
} as unknown as RuntimeContext;

describe("RuntimePipeline", () => {
  it("runs components in the order they were configured", async () => {
    const pipeline = new RuntimePipeline([stage("first"), stage("second")]);

    const result = await pipeline.execute(baseContext);

    expect(result.transaction.metadata).toEqual({
      first: true,
      second: true,
    });
  });

  it("reports size() and isEmpty() for its configured components", () => {
    expect(new RuntimePipeline([]).isEmpty()).toBe(true);
    expect(new RuntimePipeline([]).size()).toBe(0);

    const pipeline = new RuntimePipeline([stage("a"), stage("b")]);

    expect(pipeline.isEmpty()).toBe(false);
    expect(pipeline.size()).toBe(2);
    expect(pipeline.getComponents()).toHaveLength(2);
  });

  it("does not mutate the original components array after construction", () => {
    const components = [stage("a")];
    const pipeline = new RuntimePipeline(components);

    components.push(stage("b"));

    expect(pipeline.size()).toBe(1);
  });
});

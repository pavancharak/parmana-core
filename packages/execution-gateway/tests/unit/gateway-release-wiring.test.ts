import { describe, expect, it } from "vitest";

import { ExecutionGateway } from "../../src/index.js";

//
// Finding 2 (authorization path review): the gateway can release to a
// connector directly, bypassing ExecutionControlService. That is only
// acceptable when the wiring is explicit. These tests pin the constructor
// refusals that keep an unwired or doubly wired gateway from being built.
//
// The envelope verifier is built before these checks run, so the options
// below only need to be present, not functional.
//
const minimalOptions = {
  publicKey: "unused-in-constructor",
  nonceStore: {},
} as unknown as ConstructorParameters<typeof ExecutionGateway>[0];

describe("ExecutionGateway release wiring", () => {
  it("refuses to be built with neither a connector nor executionControl", () => {
    expect(() => new ExecutionGateway(minimalOptions)).toThrow(
      /requires a connector or executionControl/,
    );
  });

  it("refuses to be built with both a connector and executionControl", () => {
    const connector = { execute: async () => ({}) };

    expect(
      () =>
        new ExecutionGateway({
          ...minimalOptions,
          connector,
          executionControl: {},
        } as unknown as ConstructorParameters<typeof ExecutionGateway>[0]),
    ).toThrow(/not both/);
  });
});

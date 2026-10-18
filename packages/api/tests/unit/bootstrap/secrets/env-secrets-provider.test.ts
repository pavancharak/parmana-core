import { describe, expect, it } from "vitest";

import { EnvSecretsProvider } from "../../../../src/bootstrap/secrets/EnvSecretsProvider.js";

describe("EnvSecretsProvider", () => {
  it("returns the reference unchanged (identity pass-through)", async () => {
    const provider = new EnvSecretsProvider();

    expect(await provider.getSecret("some-token-value")).toBe(
      "some-token-value",
    );
  });

  it("does not mutate or trim the value", async () => {
    const provider = new EnvSecretsProvider();

    expect(await provider.getSecret("  padded  ")).toBe("  padded  ");
  });
});

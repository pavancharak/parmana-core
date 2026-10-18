import { describe, expect, it } from "vitest";

import {
  StaticCredentialProvider,
  isCredentialHandle,
} from "@parmana/connector-sdk";

import { CredentialVaultAdapter } from "../../src/connector-execution/index.js";

describe("CredentialVaultAdapter", () => {
  it("adapts a CredentialProvider into execution-control's CredentialVault contract", async () => {
    const provider = new StaticCredentialProvider({
      stripe: { apiKey: "sk_live_secret" },
    });
    const vault = new CredentialVaultAdapter(provider);
    const credential = await vault.getCredential("stripe");
    expect(isCredentialHandle(credential.value)).toBe(true);
  });

  it("propagates provider resolution failures without wrapping in extra secret-bearing context", async () => {
    const provider = new StaticCredentialProvider();
    const vault = new CredentialVaultAdapter(provider);
    await expect(vault.getCredential("stripe")).rejects.toThrow(
      "No static credential configured for connector: stripe.",
    );
  });
});

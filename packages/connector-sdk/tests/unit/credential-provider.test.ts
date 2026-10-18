import { describe, expect, it } from "vitest";

import {
  EnvironmentCredentialProvider,
  StaticCredentialProvider,
  brandCredentialHandle,
  isCredentialHandle,
} from "../../src/index.js";

describe("CredentialProvider", () => {
  describe("StaticCredentialProvider", () => {
    it("resolves a configured credential as a branded handle", async () => {
      const provider = new StaticCredentialProvider({
        stripe: { apiKey: "sk_live_secret" },
      });
      const handle = await provider.resolve("stripe");
      expect(isCredentialHandle(handle)).toBe(true);
      expect(handle.providerId).toBe("static");
      expect(handle.value).toEqual({ apiKey: "sk_live_secret" });
    });

    it("rejects unknown connectors without ever mentioning credential material", async () => {
      const provider = new StaticCredentialProvider({
        stripe: { apiKey: "sk_live_secret" },
      });
      await expect(provider.resolve("sap")).rejects.toThrow(
        "No static credential configured for connector: sap.",
      );
    });

    it("supports late registration via set()", async () => {
      const provider = new StaticCredentialProvider();
      provider.set("stripe", { apiKey: "sk_live_secret" });
      const handle = await provider.resolve("stripe");
      expect(handle.value).toEqual({ apiKey: "sk_live_secret" });
    });
  });

  describe("EnvironmentCredentialProvider", () => {
    it("resolves from the supplied environment map", async () => {
      const provider = new EnvironmentCredentialProvider(
        { stripe: "STRIPE_API_KEY" },
        { STRIPE_API_KEY: "sk_live_from_env" },
      );
      const handle = await provider.resolve("stripe");
      expect(isCredentialHandle(handle)).toBe(true);
      expect(handle.value).toEqual({ token: "sk_live_from_env" });
    });

    it("rejects a connector with no configured mapping", async () => {
      const provider = new EnvironmentCredentialProvider({}, {});
      await expect(provider.resolve("stripe")).rejects.toThrow(
        "No environment credential mapping configured for connector: stripe.",
      );
    });

    it("rejects a mapped but unset environment variable, without leaking any value", async () => {
      const provider = new EnvironmentCredentialProvider(
        { stripe: "STRIPE_API_KEY" },
        {},
      );
      await expect(provider.resolve("stripe")).rejects.toThrow(
        'Environment variable "STRIPE_API_KEY" for connector "stripe" is not set.',
      );
    });

    it("never includes an unrelated connector's secret value in a resolution failure", async () => {
      const provider = new EnvironmentCredentialProvider(
        { stripe: "STRIPE_API_KEY" },
        {
          STRIPE_API_KEY: "sk_live_super_secret",
          SAP_API_KEY: "sap_super_secret",
        },
      );
      // "sap" has no mapping configured; the failure message must name only
      // identifiers (connectorId, variable name) — never any secret value
      // present anywhere in the environment.
      await expect(provider.resolve("sap")).rejects.toSatisfy(
        (error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          return (
            !message.includes("sk_live_super_secret") &&
            !message.includes("sap_super_secret")
          );
        },
      );
    });
  });

  describe("credential handle branding", () => {
    it("only recognizes handles produced via brandCredentialHandle", () => {
      const raw = {
        providerId: "static",
        credentialId: "stripe",
        value: "sk_live_secret",
      };
      expect(isCredentialHandle(raw)).toBe(false);
      expect(isCredentialHandle(brandCredentialHandle(raw))).toBe(true);
      expect(isCredentialHandle("sk_live_secret")).toBe(false);
      expect(isCredentialHandle(null)).toBe(false);
      expect(isCredentialHandle(undefined)).toBe(false);
    });
  });
});

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadKeyMaterialFromSecretsManager } from "../../../src/bootstrap/loadKeyMaterialFromSecretsManager.js";
import type { SecretsProvider } from "../../../src/bootstrap/secrets/SecretsProvider.js";

function fakeProvider(
  value: string,
): SecretsProvider & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async getSecret(reference: string) {
      requested.push(reference);
      return value;
    },
  };
}

const material = JSON.stringify({
  "whole-record-ml": {
    privateKeyPem: "PRIVATE-PEM-FOR-TEST",
    publicKeyPem: "PUBLIC-PEM-FOR-TEST",
  },
});

describe("loadKeyMaterialFromSecretsManager", () => {
  let keyDirectory: string;

  beforeEach(() => {
    keyDirectory = mkdtempSync(join(tmpdir(), "parmana-keymat-"));
    delete process.env.PARMANA_KEY_MATERIAL_SECRET;
  });

  afterEach(() => {
    delete process.env.PARMANA_KEY_MATERIAL_SECRET;
  });

  it("does nothing when PARMANA_KEY_MATERIAL_SECRET is unset", async () => {
    const provider = fakeProvider(material);

    await loadKeyMaterialFromSecretsManager(keyDirectory, provider);

    expect(provider.requested).toEqual([]);
    expect(existsSync(join(keyDirectory, "whole-record-ml.private.pem"))).toBe(
      false,
    );
  });

  it("fetches the reference and writes the key files from the secret's value", async () => {
    process.env.PARMANA_KEY_MATERIAL_SECRET = "parmana/preview/keys";
    const provider = fakeProvider(material);

    await loadKeyMaterialFromSecretsManager(keyDirectory, provider);

    expect(provider.requested).toEqual(["parmana/preview/keys"]);
    expect(
      readFileSync(join(keyDirectory, "whole-record-ml.private.pem"), "utf8"),
    ).toBe("PRIVATE-PEM-FOR-TEST");
    expect(
      readFileSync(join(keyDirectory, "whole-record-ml.public.pem"), "utf8"),
    ).toBe("PUBLIC-PEM-FOR-TEST");
  });

  it("never overwrites a key file that already exists", async () => {
    process.env.PARMANA_KEY_MATERIAL_SECRET = "parmana/preview/keys";
    writeFileSync(
      join(keyDirectory, "whole-record-ml.private.pem"),
      "ALREADY-THERE",
    );
    const provider = fakeProvider(material);

    await loadKeyMaterialFromSecretsManager(keyDirectory, provider);

    expect(
      readFileSync(join(keyDirectory, "whole-record-ml.private.pem"), "utf8"),
    ).toBe("ALREADY-THERE");
  });

  it("refuses a secret whose value is not JSON, and names the source", async () => {
    process.env.PARMANA_KEY_MATERIAL_SECRET = "parmana/preview/keys";

    await expect(
      loadKeyMaterialFromSecretsManager(keyDirectory, fakeProvider("not json")),
    ).rejects.toThrow(/PARMANA_KEY_MATERIAL_SECRET secret is not valid JSON/);
  });

  it("refuses to treat the reference as the key material when the secrets provider is env", async () => {
    process.env.PARMANA_KEY_MATERIAL_SECRET = "parmana/preview/keys";
    process.env.PARMANA_SECRETS_PROVIDER = "env";

    try {
      await expect(
        loadKeyMaterialFromSecretsManager(keyDirectory),
      ).rejects.toThrow(/PARMANA_SECRETS_PROVIDER is not aws-secrets-manager/);
    } finally {
      delete process.env.PARMANA_SECRETS_PROVIDER;
    }
  });
});

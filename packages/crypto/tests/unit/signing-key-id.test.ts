import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_KEY_ID,
  currentSigningKeyId,
  currentVerificationKeyId,
} from "../../src/KeyProvider.js";

const ENV_KEYS = [
  "PARMANA_SIGNING_KEY_ID",
  "PARMANA_VERIFICATION_KEY_ID",
] as const;

describe("signing key id selection", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("defaults to DEFAULT_KEY_ID when unset", () => {
    expect(currentSigningKeyId()).toBe(DEFAULT_KEY_ID);
  });

  it("treats an empty or whitespace value as unset", () => {
    process.env.PARMANA_SIGNING_KEY_ID = "   ";
    expect(currentSigningKeyId()).toBe(DEFAULT_KEY_ID);
  });

  it("uses PARMANA_SIGNING_KEY_ID when set, trimmed", () => {
    process.env.PARMANA_SIGNING_KEY_ID = " alias/parmana-prod ";
    expect(currentSigningKeyId()).toBe("alias/parmana-prod");
  });

  it("verification key follows the signing key when no verification key is set", () => {
    process.env.PARMANA_SIGNING_KEY_ID = "alias/parmana-prod";
    expect(currentVerificationKeyId()).toBe("alias/parmana-prod");
  });

  it("an explicit verification key still wins", () => {
    process.env.PARMANA_SIGNING_KEY_ID = "alias/parmana-prod";
    process.env.PARMANA_VERIFICATION_KEY_ID = "old-key";
    expect(currentVerificationKeyId()).toBe("old-key");
  });
});

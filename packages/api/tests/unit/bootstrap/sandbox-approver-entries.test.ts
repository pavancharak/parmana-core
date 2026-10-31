import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  createCodeApprovalIssuerRegistry,
  sandboxApproverEntries,
} from "../../../src/bootstrap/codeApprovalIssuers.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privateKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
const publicKeyPem = publicKey
  .export({ type: "spki", format: "pem" })
  .toString();

const SANDBOX_ENV = {
  PARMANA_SANDBOX: "true",
  PARMANA_SANDBOX_APPROVER_ID: "sandbox-demo-approver",
  PARMANA_SANDBOX_APPROVER_KEY_ID: "sandbox-demo-approver-key-1",
  // Vercel stores a multi-line value with literal \n sequences, as the server reads it.
  PARMANA_SANDBOX_APPROVER_PRIVATE_KEY: privateKeyPem.replace(/\n/g, "\\n"),
};

describe("sandboxApproverEntries", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const name of Object.keys(SANDBOX_ENV)) {
      delete process.env[name];
    }
    Object.assign(process.env, originalEnv);
  });

  it("trusts nothing outside sandbox mode", () => {
    const { PARMANA_SANDBOX: _off, ...withoutSwitch } = SANDBOX_ENV;

    expect(sandboxApproverEntries(withoutSwitch)).toEqual([]);
    expect(
      sandboxApproverEntries({ ...SANDBOX_ENV, PARMANA_SANDBOX: "false" }),
    ).toEqual([]);
  });

  it("trusts nothing when any demo approver variable is missing", () => {
    expect(
      sandboxApproverEntries({
        ...SANDBOX_ENV,
        PARMANA_SANDBOX_APPROVER_ID: undefined,
      }),
    ).toEqual([]);
    expect(
      sandboxApproverEntries({
        ...SANDBOX_ENV,
        PARMANA_SANDBOX_APPROVER_PRIVATE_KEY: "",
      }),
    ).toEqual([]);
  });

  it("derives the public key from the demo approver's private key, not a separate value", () => {
    const [entry] = sandboxApproverEntries(SANDBOX_ENV);

    expect(entry).toEqual({
      approverId: "sandbox-demo-approver",
      keyId: "sandbox-demo-approver-key-1",
      revoked: false,
      publicKeyPem,
    });
  });

  it("is resolvable by the approval registry in sandbox mode", () => {
    for (const name of Object.keys(SANDBOX_ENV)) {
      process.env[name] = SANDBOX_ENV[name as keyof typeof SANDBOX_ENV];
    }

    const resolved = createCodeApprovalIssuerRegistry().resolve(
      "sandbox-demo-approver",
      "sandbox-demo-approver-key-1",
    );

    expect(resolved).toBeDefined();
    expect(resolved?.revoked).toBe(false);
  });

  it("is not resolvable by the approval registry outside sandbox mode", () => {
    delete process.env.PARMANA_SANDBOX;

    const resolved = createCodeApprovalIssuerRegistry().resolve(
      "sandbox-demo-approver",
      "sandbox-demo-approver-key-1",
    );

    expect(resolved).toBeUndefined();
  });
});

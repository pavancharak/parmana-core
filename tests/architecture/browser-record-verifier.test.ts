import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyExecutionTrustRecordOffline } from "@parmana/crypto";

/**
 * docs/site/verification/verify-in-browser.mdx verifies Execution Trust
 * Records in the reader's browser with the code in
 * docs/site/snippets/record-verifier.jsx. These checks run that exact
 * code (between its BEGIN and END markers) with Node's Web Crypto against
 * records signed by Parmana's own signer, and require it to agree with
 * @parmana/crypto's offline verifier. A change to the canonical view, the
 * hash or the large message commitment that the page does not follow
 * fails here.
 */

type BrowserResult = {
  valid: boolean;
  hashValid: boolean;
  signatureValid: boolean;
  signedForm?: string;
  errors: string[];
  notes: string[];
};
type BrowserVerifier = (
  record: unknown,
  publicKeyPem: string,
) => Promise<BrowserResult>;

const root = process.cwd();
const snippet = readFileSync(
  path.join(root, "docs", "site", "snippets", "record-verifier.jsx"),
  "utf8",
);
const page = readFileSync(
  path.join(root, "docs", "site", "verification", "verify-in-browser.mdx"),
  "utf8",
);

function loadBrowserVerifier(): BrowserVerifier {
  const match = snippet.match(
    /\/\/ BEGIN verifyParmanaTrustRecord\n([\s\S]*?)\/\/ END verifyParmanaTrustRecord/,
  );
  if (!match) throw new Error("verifier markers not found in the snippet");
  const source = match[1]!.replace(/^export const /m, "const ");
  return new Function(
    `${source}\nreturn verifyParmanaTrustRecord;`,
  )() as BrowserVerifier;
}

const verify = loadBrowserVerifier();
let dir: string;
let pem: string;
let small: Record<string, unknown>;
let large: Record<string, unknown>;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "browser-verifier-"));
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(root, "scripts", "generate-offline-verifier-fixture.ts"),
      dir,
    ],
    { cwd: root, stdio: "ignore" },
  );
  pem = readFileSync(path.join(dir, "public-key.pem"), "utf8");
  small = JSON.parse(readFileSync(path.join(dir, "record.json"), "utf8"));
  large = JSON.parse(readFileSync(path.join(dir, "record-large.json"), "utf8"));
}, 60_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const keyIdOf = (record: Record<string, unknown>) =>
  (record.signature as { keyId: string }).keyId;

async function bothVerifiers(record: Record<string, unknown>, key = pem) {
  const browser = await verify(record, key);
  const reference = await verifyExecutionTrustRecordOffline(record as never, {
    [keyIdOf(small)]: key,
  });
  return { browser, reference };
}

describe("the in browser record verifier", () => {
  it("accepts a record signed by Parmana's signer", async () => {
    const { browser, reference } = await bothVerifiers(small);
    expect(reference.valid).toBe(true);
    expect(browser).toMatchObject({
      valid: true,
      hashValid: true,
      signatureValid: true,
      signedForm: "raw",
    });
  });

  it("accepts a large record signed as a commitment", async () => {
    const { browser, reference } = await bothVerifiers(large);
    expect(reference.valid).toBe(true);
    expect(browser).toMatchObject({ valid: true, signedForm: "commitment" });
  });

  it("rejects a record whose signed content was changed", async () => {
    const changed = structuredClone(small);
    (changed.transaction as { signals: { amount: number } }).signals.amount =
      100000;
    const { browser, reference } = await bothVerifiers(changed);
    expect(reference.valid).toBe(false);
    expect(browser.valid).toBe(false);
    expect(browser.hashValid).toBe(false);
  });

  it("rejects a record whose hash was recomputed but not re-signed", async () => {
    const changed = structuredClone(small);
    (changed.transaction as { signals: { amount: number } }).signals.amount =
      100000;
    const recomputed = await verify(changed, pem);
    const digest = recomputed.errors[0]!.match(/computed ([0-9a-f]{64})/)![1];
    changed.trustRecordHash = digest;
    const { browser, reference } = await bothVerifiers(changed);
    expect(reference.valid).toBe(false);
    expect(browser.hashValid).toBe(true);
    expect(browser.signatureValid).toBe(false);
    expect(browser.valid).toBe(false);
  });

  it("rejects a record checked with a different key", async () => {
    const wrong = generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    const { browser, reference } = await bothVerifiers(small, wrong);
    expect(reference.valid).toBe(false);
    expect(browser.valid).toBe(false);
    expect(browser.signatureValid).toBe(false);
  });

  it("verifies the example shown on the docs page", async () => {
    const exports = page
      .match(
        /(export const exampleRecord = [\s\S]*?export const examplePublicKey =[\s\S]*?;)\n/,
      )![1]!
      .replace(/^export const /gm, "const ");
    const { record, key } = new Function(
      `${exports}\nreturn { record: exampleRecord, key: examplePublicKey };`,
    )() as { record: Record<string, unknown>; key: string };
    const browser = await verify(record, key);
    expect(browser).toMatchObject({ valid: true, hashValid: true });
    const reference = await verifyExecutionTrustRecordOffline(record, {
      [keyIdOf(record)]: key,
    });
    expect(reference.valid).toBe(true);
  });
});

import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import { signGitHubAppJwt } from "../../src/GitHubAppJwt.js";

function decodeSegment(segment: string): Record<string, unknown> {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
    string,
    unknown
  >;
}

describe("signGitHubAppJwt", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  it("produces a JWT whose signature verifies against the matching public key", () => {
    const jwt = signGitHubAppJwt({ appId: "4646139", privateKey });
    const [header, payload, signature] = jwt.split(".");

    const signingInput = `${header}.${payload}`;
    const signatureBuffer = Buffer.from(
      signature!.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );

    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(signingInput),
        publicKey,
        signatureBuffer,
      ),
    ).toBe(true);
  });

  it("fails verification against a different keypair's public key", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwt = signGitHubAppJwt({ appId: "4646139", privateKey });
    const [header, payload, signature] = jwt.split(".");

    const signingInput = `${header}.${payload}`;
    const signatureBuffer = Buffer.from(
      signature!.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    );

    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(signingInput),
        other.publicKey,
        signatureBuffer,
      ),
    ).toBe(false);
  });

  it("sets iss to the supplied appId, iat 60s in the past, and exp capped at 10 minutes", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    const jwt = signGitHubAppJwt({
      appId: "4646139",
      privateKey,
      now: () => now,
    });
    const [, payloadSegment] = jwt.split(".");
    const payload = decodeSegment(payloadSegment!);

    const nowSeconds = Math.floor(now.getTime() / 1000);
    expect(payload.iss).toBe("4646139");
    expect(payload.iat).toBe(nowSeconds - 60);
    expect(payload.exp).toBe(nowSeconds + 600);
  });

  it("never places the private key itself anywhere in the JWT's header or payload", () => {
    const jwt = signGitHubAppJwt({ appId: "4646139", privateKey });
    const [header, payload] = jwt.split(".");

    const privateKeyPem = privateKey
      .export({ type: "pkcs1", format: "pem" })
      .toString();
    const keyBody = privateKeyPem.split("\n")[1]!; // first base64 line of the PEM body

    expect(decodeSegment(header!)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.stringify(decodeSegment(payload!))).not.toContain(keyBody);
  });
});

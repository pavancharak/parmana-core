import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { AuthorityType } from "@parmana/shared";

import {
  GitHubOidcAuthenticator,
  type GitHubOidcPolicy,
} from "../../../src/auth/GitHubOidcAuthenticator.js";
import {
  CompositeCallerAuthenticator,
  looksLikeJwt,
} from "../../../src/auth/CompositeCallerAuthenticator.js";
import { StaticKeyAuthenticator } from "../../../src/auth/StaticKeyAuthenticator.js";
import { hashApiKey } from "../../../src/auth/hashApiKey.js";
import { probeOidcPolicy } from "../../../src/auth/probeOidcPolicy.js";

const REPOSITORY_ID = "123456789";
const NOW = 1_800_000_000;
const KID = "test-kid-1";

const policy: GitHubOidcPolicy = probeOidcPolicy(REPOSITORY_ID);

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const otherPair = generateKeyPairSync("rsa", { modulusLength: 2048 });

function jwkOf(key: KeyObject, kid: string) {
  return { ...key.export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
}

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    iss: policy.issuer,
    aud: policy.audience,
    iat: NOW - 10,
    nbf: NOW - 10,
    exp: NOW + 300,
    repository_id: REPOSITORY_ID,
    ref: policy.ref,
    job_workflow_ref: policy.jobWorkflowRef,
    event_name: "schedule",
    ...overrides,
  };
}

function tokenWith(
  claims: Record<string, unknown>,
  {
    header = {},
    signingKey = privateKey,
    kid = KID,
  }: {
    header?: Record<string, unknown>;
    signingKey?: KeyObject;
    kid?: string;
  } = {},
): string {
  const headerSegment = b64url({ alg: "RS256", typ: "JWT", kid, ...header });
  const payloadSegment = b64url(claims);
  const signature = sign(
    "sha256",
    Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8"),
    signingKey,
  ).toString("base64url");
  return `${headerSegment}.${payloadSegment}.${signature}`;
}

function build(
  overrides: {
    keys?: unknown[];
    now?: number;
    fetchJwks?: (url: string) => Promise<{ keys: unknown[] }>;
  } = {},
) {
  const rejections: string[] = [];
  const fetchJwks =
    overrides.fetchJwks ??
    vi.fn(async () => ({ keys: overrides.keys ?? [jwkOf(publicKey, KID)] }));
  const clock = { now: overrides.now ?? NOW };
  const authenticator = new GitHubOidcAuthenticator({
    policy,
    fetchJwks,
    now: () => clock.now,
    onRejected: (reason) => rejections.push(reason),
  });
  return { authenticator, fetchJwks, rejections, clock };
}

describe("GitHubOidcAuthenticator: accepted tokens", () => {
  it("maps a valid scheduled probe token to the fixed probe identity", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(tokenWith(validClaims())),
    ).resolves.toEqual({
      callerId: "github-actions:kill-switch-probe",
      allowedCapabilities: ["kill-switch:probe"],
      credentialHolderType: AuthorityType.SERVICE,
    });
    expect(rejections).toEqual([]);
  });

  it("accepts a workflow_dispatch run from main", async () => {
    const { authenticator } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ event_name: "workflow_dispatch" })),
      ),
    ).resolves.toMatchObject({ callerId: "github-actions:kill-switch-probe" });
  });

  it("accepts an audience given as an array that contains the policy audience", async () => {
    const { authenticator } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(
          validClaims({ aud: ["https://other.example", policy.audience] }),
        ),
      ),
    ).resolves.toBeDefined();
  });

  it("accepts a token issued a little in the future, within clock skew", async () => {
    const { authenticator } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(
          validClaims({ iat: NOW + 30, nbf: NOW + 30, exp: NOW + 330 }),
        ),
      ),
    ).resolves.toBeDefined();
  });

  it("returns a fresh identity object, not shared state", async () => {
    const { authenticator } = build();
    const token = tokenWith(validClaims());

    const first = await authenticator.authenticate(token);
    first?.allowedCapabilities?.push("*");
    const second = await authenticator.authenticate(token);

    expect(second?.allowedCapabilities).toEqual(["kill-switch:probe"]);
  });
});

describe("GitHubOidcAuthenticator: refused tokens", () => {
  it("rejects a token signed by a key that is not in the JWKS", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims(), { signingKey: otherPair.privateKey }),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["bad signature"]);
  });

  it("rejects a payload altered after signing", async () => {
    const { authenticator, rejections } = build();
    const token = tokenWith(validClaims());
    const [header, , signature] = token.split(".");
    const forged = b64url(
      validClaims({ event_name: "workflow_dispatch", ref: "refs/heads/evil" }),
    );

    await expect(
      authenticator.authenticate(`${header}.${forged}.${signature}`),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["bad signature"]);
  });

  it("rejects the none algorithm", async () => {
    const { authenticator, rejections } = build();
    const unsigned = `${b64url({ alg: "none", kid: KID })}.${b64url(validClaims())}.`;

    await expect(authenticator.authenticate(unsigned)).resolves.toBeUndefined();
    expect(rejections).toEqual(["malformed token"]);
  });

  it("rejects an HS256 token, so a public key cannot be used as an HMAC secret", async () => {
    const { authenticator, rejections } = build();
    const headerSegment = b64url({ alg: "HS256", kid: KID });
    const payloadSegment = b64url(validClaims());
    const hmac = Buffer.from("not-a-real-secret").toString("base64url");

    await expect(
      authenticator.authenticate(`${headerSegment}.${payloadSegment}.${hmac}`),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["unsupported algorithm"]);
  });

  it("rejects a token with no kid", async () => {
    const { authenticator, rejections } = build();
    const headerSegment = b64url({ alg: "RS256" });
    const payloadSegment = b64url(validClaims());
    const signature = sign(
      "sha256",
      Buffer.from(`${headerSegment}.${payloadSegment}`, "utf8"),
      privateKey,
    ).toString("base64url");

    await expect(
      authenticator.authenticate(
        `${headerSegment}.${payloadSegment}.${signature}`,
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["missing kid"]);
  });

  it("rejects the wrong issuer", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ iss: "https://evil.example" })),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["wrong issuer"]);
  });

  it("rejects a token minted for another audience", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ aud: "https://other.example" })),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["wrong audience"]);
  });

  it("rejects an expired token", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ iat: NOW - 900, exp: NOW - 600 })),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["expired"]);
  });

  it("rejects a token issued well in the future", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(
          validClaims({ iat: NOW + 600, nbf: NOW + 600, exp: NOW + 900 }),
        ),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["issued in the future"]);
  });

  it("rejects a token whose nbf is in the future", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(tokenWith(validClaims({ nbf: NOW + 600 }))),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["not yet valid"]);
  });

  it("rejects a token that lives longer than the maximum lifetime", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(tokenWith(validClaims({ exp: NOW + 3_600 }))),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["token lifetime out of bounds"]);
  });

  it("rejects a token whose exp is not after iat", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(tokenWith(validClaims({ exp: NOW - 10 }))),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["token lifetime out of bounds"]);
  });

  it("rejects a token from another repository", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ repository_id: "999" })),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["wrong repository"]);
  });

  it("rejects a token minted on a branch", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ ref: "refs/heads/feature" })),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["wrong ref"]);
  });

  it("rejects a token from another workflow in the same repository", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(
          validClaims({
            job_workflow_ref:
              "pavancharak/parmana-core/.github/workflows/ci.yml@refs/heads/main",
          }),
        ),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["wrong workflow"]);
  });

  it("rejects an event that the probe workflow does not use", async () => {
    const { authenticator, rejections } = build();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ event_name: "pull_request" })),
      ),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["wrong event"]);
  });

  it("rejects a token with no event_name", async () => {
    const { authenticator, rejections } = build();
    const claims: Record<string, unknown> = validClaims();
    delete claims.event_name;

    await expect(
      authenticator.authenticate(tokenWith(claims)),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["wrong event"]);
  });

  it("rejects malformed input without throwing", async () => {
    const { authenticator, rejections } = build();

    await expect(authenticator.authenticate("a.b.c")).resolves.toBeUndefined();
    await expect(
      authenticator.authenticate("only-one-segment"),
    ).resolves.toBeUndefined();
    await expect(
      authenticator.authenticate("!!.@@.##"),
    ).resolves.toBeUndefined();
    await expect(authenticator.authenticate("")).resolves.toBeUndefined();
    await expect(
      authenticator.authenticate(undefined),
    ).resolves.toBeUndefined();
    expect(rejections.length).toBeGreaterThan(0);
  });
});

describe("GitHubOidcAuthenticator: JWKS handling", () => {
  it("fetches the JWKS once and reuses it for later tokens", async () => {
    const { authenticator, fetchJwks } = build();

    await authenticator.authenticate(tokenWith(validClaims()));
    await authenticator.authenticate(tokenWith(validClaims()));

    expect(fetchJwks).toHaveBeenCalledTimes(1);
    expect(fetchJwks).toHaveBeenCalledWith(policy.jwksUrl);
  });

  it("refuses everything when the JWKS cannot be fetched", async () => {
    const { authenticator, rejections } = build({
      fetchJwks: vi.fn(async () => {
        throw new Error("network down");
      }),
    });

    await expect(
      authenticator.authenticate(tokenWith(validClaims())),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["verification error: network down"]);
  });

  it("picks up a rotated key when the kid is unknown, after the refresh interval", async () => {
    const clock = { now: NOW };
    const fetchJwks = vi
      .fn()
      .mockResolvedValueOnce({ keys: [jwkOf(otherPair.publicKey, "old-kid")] })
      .mockResolvedValueOnce({ keys: [jwkOf(publicKey, KID)] });
    const authenticator = new GitHubOidcAuthenticator({
      policy,
      fetchJwks,
      now: () => clock.now,
    });

    await expect(
      authenticator.authenticate(tokenWith(validClaims())),
    ).resolves.toBeUndefined();
    clock.now = NOW + 61;
    await expect(
      authenticator.authenticate(
        tokenWith(
          validClaims({
            iat: NOW + 61 - 10,
            nbf: NOW + 61 - 10,
            exp: NOW + 61 + 300,
          }),
        ),
      ),
    ).resolves.toBeDefined();

    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });

  it("does not refetch on every unknown kid, so forged kids cannot hammer GitHub", async () => {
    const clock = { now: NOW };
    const fetchJwks = vi.fn(async () => ({ keys: [jwkOf(publicKey, KID)] }));
    const authenticator = new GitHubOidcAuthenticator({
      policy,
      fetchJwks,
      now: () => clock.now,
    });

    await authenticator.authenticate(tokenWith(validClaims()));
    for (let i = 0; i < 20; i += 1) {
      await authenticator.authenticate(
        tokenWith(validClaims(), { kid: `forged-${i}` }),
      );
    }

    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  it("skips a malformed key in the JWKS and still verifies with the others", async () => {
    const { authenticator } = build({
      keys: [
        { kty: "RSA", kid: "broken", n: "AAAA", e: "AQAB" },
        jwkOf(publicKey, KID),
      ],
    });

    await expect(
      authenticator.authenticate(tokenWith(validClaims())),
    ).resolves.toBeDefined();
  });

  it("ignores JWKS entries that are not signing keys for RS256", async () => {
    const { authenticator, rejections } = build({
      keys: [{ ...jwkOf(publicKey, KID), use: "enc" }],
    });

    await expect(
      authenticator.authenticate(tokenWith(validClaims())),
    ).resolves.toBeUndefined();
    expect(rejections).toEqual(["unknown signing key"]);
  });
});

describe("looksLikeJwt", () => {
  it("recognises three base64url segments", () => {
    expect(looksLikeJwt("aaa.bbb.ccc")).toBe(true);
  });

  it("does not treat a static API key as a JWT", () => {
    expect(looksLikeJwt("k3Jf9Qe0s_Z8mP2vN7bX1cR5tY4uW6aH0gL9dF3eS8o")).toBe(
      false,
    );
    expect(looksLikeJwt(hashApiKey("some-key"))).toBe(false);
  });
});

describe("CompositeCallerAuthenticator", () => {
  function composite(
    keys = [{ callerId: "orchestrator-1", keyHash: hashApiKey("static-key") }],
  ) {
    const oidc = build();
    const staticKeys = new StaticKeyAuthenticator(keys);
    const spyOidc = vi.spyOn(oidc.authenticator, "authenticate");
    const spyStatic = vi.spyOn(staticKeys, "authenticate");
    return {
      authenticator: new CompositeCallerAuthenticator(
        oidc.authenticator,
        staticKeys,
      ),
      spyOidc,
      spyStatic,
    };
  }

  it("routes a JWT-shaped credential to OIDC only", async () => {
    const { authenticator, spyOidc, spyStatic } = composite();

    await expect(
      authenticator.authenticate(tokenWith(validClaims())),
    ).resolves.toMatchObject({
      callerId: "github-actions:kill-switch-probe",
    });
    expect(spyOidc).toHaveBeenCalledTimes(1);
    expect(spyStatic).not.toHaveBeenCalled();
  });

  it("routes a static key to the static authenticator only", async () => {
    const { authenticator, spyOidc, spyStatic } = composite();

    await expect(authenticator.authenticate("static-key")).resolves.toEqual({
      callerId: "orchestrator-1",
    });
    expect(spyOidc).not.toHaveBeenCalled();
    expect(spyStatic).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to static keys when a JWT is refused", async () => {
    const { authenticator, spyStatic } = composite();

    await expect(
      authenticator.authenticate(
        tokenWith(validClaims({ ref: "refs/heads/evil" })),
      ),
    ).resolves.toBeUndefined();
    expect(spyStatic).not.toHaveBeenCalled();
  });

  it("refuses an absent credential", async () => {
    const { authenticator } = composite();

    await expect(
      authenticator.authenticate(undefined),
    ).resolves.toBeUndefined();
  });
});

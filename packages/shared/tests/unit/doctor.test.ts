import { generateKeyPairSync, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  closestSetting,
  diagnoseConfiguration,
  type DoctorCheck,
  type DoctorReaders,
} from "../../src/config/Doctor.js";

const { publicKey } = generateKeyPairSync("ed25519");
const PUBLIC_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const { privateKey } = generateKeyPairSync("ed25519");
const PRIVATE_PEM = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const API_KEYS = JSON.stringify([
  { callerId: "local-tester", keyHash: randomBytes(32).toString("hex") },
]);

/** A readable folder layout: the policy folder has a file, and the key folder holds the default pair. */
function readers(
  overrides: Partial<DoctorReaders> & { files?: Record<string, string> } = {},
): DoctorReaders {
  const files: Record<string, string> = {
    "/keys/default.private.pem":
      "-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----",
    "/keys/default.public.pem": PUBLIC_PEM,
    ...overrides.files,
  };
  return {
    directoryExists: (path) => path === "/policies" || path === "/keys",
    listDirectory: (path) => {
      if (path === "/policies") return ["refund.json"];
      if (path === "/keys")
        return ["default.private.pem", "default.public.pem"];
      return [];
    },
    readFile: (path) => {
      const value = files[path];
      if (value === undefined) throw new Error(`no such file: ${path}`);
      return value;
    },
    ...overrides,
  };
}

/** A complete, valid local environment. */
function env(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    PARMANA_STORAGE: "memory",
    CRYPTO_MODE: "single",
    HASH_PROVIDER: "sha256",
    PRIMARY_SIGNATURE_PROVIDER: "ed25519",
    KEY_PROVIDER: "local",
    PARMANA_KEY_DIR: "/keys",
    PARMANA_POLICY_DIR: "/policies",
    PARMANA_API_KEYS: API_KEYS,
    TRUST_PROFILE: "v1",
    ...overrides,
  };
}

function check(checks: DoctorCheck[], name: string): DoctorCheck {
  const found = checks.find((item) => item.name === name);
  if (found === undefined) throw new Error(`no check named ${name}`);
  return found;
}

function failures(checks: DoctorCheck[]): DoctorCheck[] {
  return checks.filter((item) => item.level === "fail");
}

describe("configuration doctor, local deployment", () => {
  it("reports no failures for a complete local environment", () => {
    const checks = diagnoseConfiguration(env(), readers());
    expect(failures(checks)).toEqual([]);
    expect(check(checks, "default key pair").level).toBe("pass");
  });

  it("warns that memory storage loses state, which is expected locally", () => {
    expect(
      check(diagnoseConfiguration(env(), readers()), "PARMANA_STORAGE").level,
    ).toBe("warn");
  });

  it("fails DATABASE_PROVIDER, the name the server no longer reads, and says to rename it", () => {
    const result = check(
      diagnoseConfiguration(env({ DATABASE_PROVIDER: "postgres" }), readers()),
      "DATABASE_PROVIDER",
    );
    expect(result.level).toBe("fail");
    expect(result.fix).toContain("PARMANA_STORAGE");
  });

  it("fails an unsupported storage value and lists the allowed names", () => {
    const result = check(
      diagnoseConfiguration(env({ PARMANA_STORAGE: "sqlite" }), readers()),
      "PARMANA_STORAGE",
    );
    expect(result.level).toBe("fail");
    expect(result.fix).toContain("memory, postgres, supabase");
  });

  it("fails an unknown signature algorithm, and accepts the documented ml-dsa-65 alias", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ PRIMARY_SIGNATURE_PROVIDER: "rsa" }),
          readers(),
        ),
        "PRIMARY_SIGNATURE_PROVIDER",
      ).level,
    ).toBe("fail");
    expect(
      check(
        diagnoseConfiguration(
          env({ PRIMARY_SIGNATURE_PROVIDER: "ml-dsa-65" }),
          readers(),
        ),
        "PRIMARY_SIGNATURE_PROVIDER",
      ).level,
    ).toBe("pass");
  });

  it("fails a key provider this build does not implement", () => {
    expect(
      check(
        diagnoseConfiguration(env({ KEY_PROVIDER: "hsm-cloud" }), readers()),
        "KEY_PROVIDER",
      ).level,
    ).toBe("fail");
  });

  it("does not check aws-kms keys here, and says so", () => {
    const result = check(
      diagnoseConfiguration(env({ KEY_PROVIDER: "aws-kms" }), readers()),
      "KEY_PROVIDER",
    );
    expect(result.level).toBe("warn");
    expect(result.message).toContain("--production");
  });

  it("fails a missing key folder setting", () => {
    expect(
      check(
        diagnoseConfiguration(env({ PARMANA_KEY_DIR: undefined }), readers()),
        "PARMANA_KEY_DIR",
      ).level,
    ).toBe("fail");
  });

  it("fails when the default key pair is missing and no key material is given", () => {
    const missing = readers({ listDirectory: () => [] });
    const result = check(
      diagnoseConfiguration(env(), missing),
      "default key pair",
    );
    expect(result.level).toBe("fail");
    expect(result.fix).toContain("PARMANA_KEY_MATERIAL_JSON");
  });

  it("warns, rather than fails, when the key pair will be written from PARMANA_KEY_MATERIAL_JSON", () => {
    const missing = readers({ listDirectory: () => [] });
    const result = check(
      diagnoseConfiguration(env({ PARMANA_KEY_MATERIAL_JSON: "{}" }), missing),
      "default key pair",
    );
    expect(result.level).toBe("warn");
  });

  it("fails a public key file that holds a private key, and never prints its contents", () => {
    const leaked = readers({
      files: { "/keys/default.public.pem": PRIVATE_PEM },
    });
    const checks = diagnoseConfiguration(env(), leaked);
    const result = check(checks, "default public key");
    expect(result.level).toBe("fail");
    expect(result.message).toContain("private key");
    expect(JSON.stringify(checks)).not.toContain(
      PRIVATE_PEM.split("\n")[1] ?? "",
    );
  });

  it("fails an invalid PARMANA_KEY_MATERIAL_JSON without echoing it", () => {
    const secret = "not-json-with-a-secret-inside";
    const checks = diagnoseConfiguration(
      env({ PARMANA_KEY_MATERIAL_JSON: secret }),
      readers(),
    );
    expect(check(checks, "PARMANA_KEY_MATERIAL_JSON").level).toBe("fail");
    expect(JSON.stringify(checks)).not.toContain(secret);
  });

  it("fails a missing policy folder setting, and a policy folder that does not exist", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ PARMANA_POLICY_DIR: undefined }),
          readers(),
        ),
        "PARMANA_POLICY_DIR",
      ).level,
    ).toBe("fail");
    expect(
      check(
        diagnoseConfiguration(
          env({ PARMANA_POLICY_DIR: "/nowhere" }),
          readers(),
        ),
        "PARMANA_POLICY_DIR",
      ).level,
    ).toBe("fail");
  });

  it("warns on an empty policy folder, because requests naming a policy would fail", () => {
    const empty = readers({
      listDirectory: (path) =>
        path === "/keys" ? ["default.private.pem", "default.public.pem"] : [],
    });
    expect(
      check(diagnoseConfiguration(env(), empty), "PARMANA_POLICY_DIR").level,
    ).toBe("warn");
  });

  it("fails when no API keys are set and authentication is not disabled", () => {
    const result = check(
      diagnoseConfiguration(env({ PARMANA_API_KEYS: undefined }), readers()),
      "PARMANA_API_KEYS",
    );
    expect(result.level).toBe("fail");
  });

  it("warns, rather than fails, when authentication is disabled", () => {
    const checks = diagnoseConfiguration(
      env({ PARMANA_API_KEYS: undefined, PARMANA_AUTH_DISABLED: "true" }),
      readers(),
    );
    expect(check(checks, "PARMANA_AUTH_DISABLED").level).toBe("warn");
    expect(
      failures(checks).some((item) => item.name === "PARMANA_API_KEYS"),
    ).toBe(false);
  });

  it("fails malformed PARMANA_API_KEYS without echoing it", () => {
    const secret = "not-json-token-value";
    const checks = diagnoseConfiguration(
      env({ PARMANA_API_KEYS: secret }),
      readers(),
    );
    expect(check(checks, "PARMANA_API_KEYS").level).toBe("fail");
    expect(JSON.stringify(checks)).not.toContain(secret);
  });

  it("fails hybrid schema version 3 without the acknowledgement", () => {
    expect(
      check(
        diagnoseConfiguration(env({ HYBRID_SCHEMA_VERSION: "3" }), readers()),
        "HYBRID_SCHEMA_VERSION",
      ).level,
    ).toBe("fail");
    expect(
      check(
        diagnoseConfiguration(
          env({
            HYBRID_SCHEMA_VERSION: "3",
            HYBRID_SCHEMA_V3_ACKNOWLEDGED: "true",
          }),
          readers(),
        ),
        "HYBRID_SCHEMA_VERSION",
      ).level,
    ).toBe("pass");
  });

  it("fails a cutover timestamp that is not UTC", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ HYBRID_REQUIRED_FROM: "2026-12-01T00:00:00+01:00" }),
          readers(),
        ),
        "HYBRID_REQUIRED_FROM",
      ).level,
    ).toBe("fail");
  });

  it("warns when hybrid signing is required but the mode is single", () => {
    const checks = diagnoseConfiguration(
      env({ HYBRID_SIGNATURE_REQUIRED: "true", CRYPTO_MODE: "single" }),
      readers(),
    );
    expect(check(checks, "HYBRID_SIGNATURE_REQUIRED").level).toBe("warn");
  });

  it("fails a non-numeric port, which the server would otherwise use as NaN", () => {
    expect(
      check(diagnoseConfiguration(env({ PORT: "eighty" }), readers()), "PORT")
        .level,
    ).toBe("fail");
    expect(
      failures(diagnoseConfiguration(env({ PORT: "8080" }), readers())).some(
        (item) => item.name === "PORT",
      ),
    ).toBe(false);
  });

  it("fails a rate limit that is not a whole number", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ RATE_LIMIT_EXECUTE_PER_MINUTE: "1.5" }),
          readers(),
        ),
        "RATE_LIMIT_EXECUTE_PER_MINUTE",
      ).level,
    ).toBe("fail");
  });

  it("reports a misspelt PARMANA_ setting with the closest real name", () => {
    const result = check(
      diagnoseConfiguration(env({ PARMANA_STORAGEE: "memory" }), readers()),
      "PARMANA_STORAGEE",
    );
    expect(result.level).toBe("warn");
    expect(result.message).toContain("Did you mean PARMANA_STORAGE?");
  });

  it("does not flag known sandbox and test settings", () => {
    const checks = diagnoseConfiguration(
      env({
        PARMANA_SANDBOX: "true",
        PARMANA_CORS_ORIGINS: "https://example.com",
      }),
      readers(),
    );
    expect(checks.some((item) => item.name === "PARMANA_SANDBOX")).toBe(false);
    expect(checks.some((item) => item.name === "PARMANA_CORS_ORIGINS")).toBe(
      false,
    );
  });

  it("never prints a secret value, even one set under a misspelt name", () => {
    const secret = "sandbox-approver-secret-value-xyz";
    const checks = diagnoseConfiguration(
      env({ PARMANA_SANDBOX_APPROVER_PRIVAT_KEY: secret }),
      readers(),
    );
    expect(JSON.stringify(checks)).not.toContain(secret);
  });

  it("reports every problem at once, not just the first", () => {
    const checks = diagnoseConfiguration(
      env({ PORT: "x", PARMANA_STORAGE: "bogus", PARMANA_API_KEYS: undefined }),
      readers(),
    );
    expect(failures(checks).map((item) => item.name)).toEqual(
      expect.arrayContaining(["PORT", "PARMANA_STORAGE", "PARMANA_API_KEYS"]),
    );
  });

  it("suggests nothing for a name far from every real setting", () => {
    expect(
      closestSetting("PARMANA_COMPLETELY_UNRELATED_THING"),
    ).toBeUndefined();
  });
});

const PRODUCTION = { production: true } as const;
const PROD_ENV = {
  NODE_ENV: "production",
  PARMANA_STORAGE: "postgres",
  DATABASE_URL:
    "postgresql://parmana:secret-password-value@db.internal:5432/parmana?sslmode=require",
  KEY_PROVIDER: "aws-kms",
  AWS_REGION: "ap-south-1",
  KILL_SWITCH_ENABLED: "true",
  KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR: "true",
};

describe("configuration doctor, production rules", () => {
  it("passes a complete production environment with no failures", () => {
    const checks = diagnoseConfiguration(env(PROD_ENV), readers(), PRODUCTION);
    expect(failures(checks)).toEqual([]);
  });

  it("fails memory storage in production, because nothing is durable", () => {
    const result = check(
      diagnoseConfiguration(
        env({ ...PROD_ENV, PARMANA_STORAGE: "memory" }),
        readers(),
        PRODUCTION,
      ),
      "PARMANA_STORAGE",
    );
    expect(result.level).toBe("fail");
  });

  it("fails postgres storage without DATABASE_URL, and never echoes a URL", () => {
    const checks = diagnoseConfiguration(
      env({ ...PROD_ENV, DATABASE_URL: undefined }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "DATABASE_URL").level).toBe("fail");
  });

  it("fails a DATABASE_URL with the wrong scheme, without printing it", () => {
    const wrong = "mysql://parmana:secret-password-value@db.internal/parmana";
    const checks = diagnoseConfiguration(
      env({ ...PROD_ENV, DATABASE_URL: wrong }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "DATABASE_URL").level).toBe("fail");
    expect(JSON.stringify(checks)).not.toContain("secret-password-value");
    expect(JSON.stringify(checks)).not.toContain("db.internal");
  });

  it("warns on a DATABASE_URL without sslmode, and does not print it", () => {
    const checks = diagnoseConfiguration(
      env({
        ...PROD_ENV,
        DATABASE_URL:
          "postgresql://parmana:secret-password-value@db.internal/parmana",
      }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "DATABASE_URL").level).toBe("warn");
    expect(JSON.stringify(checks)).not.toContain("secret-password-value");
  });

  it("fails aws-kms without AWS_REGION", () => {
    const result = check(
      diagnoseConfiguration(
        env({ ...PROD_ENV, AWS_REGION: undefined }),
        readers(),
        PRODUCTION,
      ),
      "AWS_REGION",
    );
    expect(result.level).toBe("fail");
  });

  it("does not need local key files with aws-kms, because the key stays in KMS", () => {
    const noFiles = readers({ listDirectory: () => [] });
    const checks = diagnoseConfiguration(env(PROD_ENV), noFiles, PRODUCTION);
    expect(
      failures(checks).some((item) => item.name === "default key pair"),
    ).toBe(false);
  });

  it("fails hybrid signing with aws-kms, in both local and production modes", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ ...PROD_ENV, CRYPTO_MODE: "hybrid" }),
          readers(),
          PRODUCTION,
        ),
        "KEY_PROVIDER",
      ).level,
    ).toBe("fail");
    expect(
      check(
        diagnoseConfiguration(
          env({ KEY_PROVIDER: "aws-kms", CRYPTO_MODE: "hybrid" }),
          readers(),
        ),
        "KEY_PROVIDER",
      ).level,
    ).toBe("fail");
  });

  it("fails authentication disabled in production", () => {
    const checks = diagnoseConfiguration(
      env({ ...PROD_ENV, PARMANA_AUTH_DISABLED: "true" }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "production: PARMANA_AUTH_DISABLED").level).toBe(
      "fail",
    );
  });

  it("fails the sandbox in production", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ ...PROD_ENV, PARMANA_SANDBOX: "true" }),
          readers(),
          PRODUCTION,
        ),
        "PARMANA_SANDBOX",
      ).level,
    ).toBe("fail");
  });

  it("warns that the kill switch is off in production", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ ...PROD_ENV, KILL_SWITCH_ENABLED: undefined }),
          readers(),
          PRODUCTION,
        ),
        "KILL_SWITCH_ENABLED",
      ).level,
    ).toBe("warn");
  });

  it("fails an enabled kill switch that does not state its reset rule", () => {
    const checks = diagnoseConfiguration(
      env({ ...PROD_ENV, KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR: undefined }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR").level).toBe(
      "fail",
    );
  });

  it("fails aws-secrets-manager without AWS_REGION", () => {
    const checks = diagnoseConfiguration(
      env({
        ...PROD_ENV,
        AWS_REGION: undefined,
        PARMANA_SECRETS_PROVIDER: "aws-secrets-manager",
      }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "PARMANA_SECRETS_PROVIDER").level).toBe("fail");
  });

  it("warns when NODE_ENV is not production, because the refusals depend on it", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ ...PROD_ENV, NODE_ENV: "development" }),
          readers(),
          PRODUCTION,
        ),
        "NODE_ENV",
      ).level,
    ).toBe("warn");
  });

  it("fails an invalid PARMANA_DB_SCHEMA", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ ...PROD_ENV, PARMANA_DB_SCHEMA: "Bad-Schema" }),
          readers(),
          PRODUCTION,
        ),
        "PARMANA_DB_SCHEMA",
      ).level,
    ).toBe("fail");
    const valid = diagnoseConfiguration(
      env({ ...PROD_ENV, PARMANA_DB_SCHEMA: "parmana_sandbox" }),
      readers(),
      PRODUCTION,
    );
    expect(valid.some((item) => item.name === "PARMANA_DB_SCHEMA")).toBe(false);
  });

  it("warns about key material written from an environment variable in production", () => {
    expect(
      check(
        diagnoseConfiguration(
          env({ ...PROD_ENV, PARMANA_KEY_MATERIAL_JSON: "{}" }),
          readers(),
          PRODUCTION,
        ),
        "production: PARMANA_KEY_MATERIAL_JSON",
      ).level,
    ).toBe("warn");
  });

  it("never prints the database password, however the check fails", () => {
    const checks = diagnoseConfiguration(
      env({
        ...PROD_ENV,
        PARMANA_STORAGE: "bogus",
        DATABASE_URL: "ftp://parmana:secret-password-value@x",
      }),
      readers(),
      PRODUCTION,
    );
    expect(JSON.stringify(checks)).not.toContain("secret-password-value");
  });

  it("passes a CA file that holds a certificate, and checks it without a private key", () => {
    const checks = diagnoseConfiguration(
      env({ ...PROD_ENV, PARMANA_DATABASE_CA_FILE: "/ca.pem" }),
      readers({
        files: {
          "/ca.pem":
            "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----",
        },
      }),
      PRODUCTION,
    );
    expect(check(checks, "PARMANA_DATABASE_CA_FILE").level).toBe("pass");
  });

  it("fails a CA file that holds a private key, and never prints it", () => {
    const checks = diagnoseConfiguration(
      env({ ...PROD_ENV, PARMANA_DATABASE_CA_FILE: "/ca.pem" }),
      readers({ files: { "/ca.pem": PRIVATE_PEM } }),
      PRODUCTION,
    );
    expect(check(checks, "PARMANA_DATABASE_CA_FILE").level).toBe("fail");
    expect(JSON.stringify(checks)).not.toContain(
      PRIVATE_PEM.split("\n")[1] ?? "",
    );
  });

  it("warns that sslmode in the URL is ignored when a CA file is set", () => {
    const checks = diagnoseConfiguration(
      env({
        ...PROD_ENV,
        DATABASE_URL:
          "postgresql://parmana:secret-password-value@db.internal/parmana?sslmode=require",
        PARMANA_DATABASE_CA_FILE: "/ca.pem",
      }),
      readers({
        files: {
          "/ca.pem":
            "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----",
        },
      }),
      PRODUCTION,
    );
    expect(
      checks.some(
        (item) =>
          item.name === "DATABASE_URL" &&
          item.level === "warn" &&
          item.message.includes("ignored"),
      ),
    ).toBe(true);
    expect(JSON.stringify(checks)).not.toContain("secret-password-value");
  });

  it("passes a CA given as text in PARMANA_DATABASE_CA", () => {
    const checks = diagnoseConfiguration(
      env({
        ...PROD_ENV,
        PARMANA_DATABASE_CA:
          "-----BEGIN CERTIFICATE-----\\nx\\n-----END CERTIFICATE-----",
      }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "PARMANA_DATABASE_CA").level).toBe("pass");
  });

  it("fails when both CA settings are set", () => {
    const checks = diagnoseConfiguration(
      env({
        ...PROD_ENV,
        PARMANA_DATABASE_CA:
          "-----BEGIN CERTIFICATE-----\\nx\\n-----END CERTIFICATE-----",
        PARMANA_DATABASE_CA_FILE: "/ca.pem",
      }),
      readers({
        files: {
          "/ca.pem":
            "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----",
        },
      }),
      PRODUCTION,
    );
    expect(check(checks, "PARMANA_DATABASE_CA").level).toBe("fail");
  });

  it("fails a CA text that holds a private key, and never prints it", () => {
    const checks = diagnoseConfiguration(
      env({ ...PROD_ENV, PARMANA_DATABASE_CA: PRIVATE_PEM }),
      readers(),
      PRODUCTION,
    );
    expect(check(checks, "PARMANA_DATABASE_CA").level).toBe("fail");
    expect(JSON.stringify(checks)).not.toContain(
      PRIVATE_PEM.split("\n")[1] ?? "",
    );
  });

  it("warns when sslmode=disable, which sends the connection unencrypted", () => {
    const checks = diagnoseConfiguration(
      env({
        ...PROD_ENV,
        DATABASE_URL:
          "postgresql://parmana:secret-password-value@db.internal/parmana?sslmode=disable",
      }),
      readers(),
      PRODUCTION,
    );
    const result = check(checks, "DATABASE_URL");
    expect(result.level).toBe("warn");
    expect(result.message).toContain("disable");
    expect(JSON.stringify(checks)).not.toContain("secret-password-value");
  });
});

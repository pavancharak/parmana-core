import { describe, expect, it } from "vitest";

import {
  databaseSslOptions,
  withoutSslParams,
} from "../../src/postgres/PostgresPoolFactory.js";

const CERT_PEM =
  "-----BEGIN CERTIFICATE-----\nMIIBplaceholder\n-----END CERTIFICATE-----\n";

describe("databaseSslOptions", () => {
  it("returns no TLS options when PARMANA_DATABASE_CA_FILE is unset", () => {
    expect(databaseSslOptions({})).toEqual({});
    expect(databaseSslOptions({ PARMANA_DATABASE_CA_FILE: "  " })).toEqual({});
  });

  it("verifies against the CA file when it holds a certificate", () => {
    const options = databaseSslOptions(
      { PARMANA_DATABASE_CA_FILE: "/ca.pem" },
      () => CERT_PEM,
    );
    expect(options).toEqual({
      ssl: { ca: CERT_PEM, rejectUnauthorized: true },
    });
  });

  it("fails closed when the CA file cannot be read, and names the path", () => {
    expect(() =>
      databaseSslOptions({ PARMANA_DATABASE_CA_FILE: "/missing.pem" }, () => {
        throw new Error("ENOENT");
      }),
    ).toThrow(/cannot be read: \/missing\.pem/);
  });

  it("fails closed when the file holds no certificate, and does not print its contents", () => {
    const notCert =
      "-----BEGIN PUBLIC KEY-----\nnot-a-certificate-body\n-----END PUBLIC KEY-----";
    let message = "";
    try {
      databaseSslOptions(
        { PARMANA_DATABASE_CA_FILE: "/wrong.pem" },
        () => notCert,
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("does not hold a PEM certificate");
    expect(message).not.toContain("not-a-certificate-body");
  });
});

describe("withoutSslParams", () => {
  it("removes sslmode and related parameters, and keeps the rest", () => {
    const result = withoutSslParams(
      "postgresql://user:pw@db.example.com:5432/app?sslmode=disable&sslrootcert=/x.pem&application_name=parmana",
    );
    expect(result).not.toContain("sslmode");
    expect(result).not.toContain("sslrootcert");
    expect(result).toContain("application_name=parmana");
    expect(result).toContain("db.example.com:5432");
  });

  it("leaves a URL with no SSL parameters unchanged in meaning", () => {
    const result = withoutSslParams("postgresql://user:pw@db.example.com/app");
    expect(new URL(result).hostname).toBe("db.example.com");
    expect(new URL(result).searchParams.toString()).toBe("");
  });
});

describe("databaseSslOptions, certificate text", () => {
  it("accepts the certificate text in PARMANA_DATABASE_CA, with literal \\n as line breaks", () => {
    const options = databaseSslOptions({
      PARMANA_DATABASE_CA:
        "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----",
    });
    expect(options).toEqual({
      ssl: {
        ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
        rejectUnauthorized: true,
      },
    });
  });

  it("refuses both PARMANA_DATABASE_CA and PARMANA_DATABASE_CA_FILE", () => {
    expect(() =>
      databaseSslOptions(
        { PARMANA_DATABASE_CA: CERT_PEM, PARMANA_DATABASE_CA_FILE: "/ca.pem" },
        () => CERT_PEM,
      ),
    ).toThrow(/not both/);
  });

  it("refuses a certificate text that holds no certificate, without printing it", () => {
    const secret =
      "-----BEGIN PRIVATE KEY-----\nsecret-key-material\n-----END PRIVATE KEY-----";
    let message = "";
    try {
      databaseSslOptions({ PARMANA_DATABASE_CA: secret });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("does not hold a PEM certificate");
    expect(message).not.toContain("not-a-certificate-body");
  });
});

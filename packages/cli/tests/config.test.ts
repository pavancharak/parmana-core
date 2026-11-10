import { describe, expect, it } from "vitest";

import {
  configPath,
  DEFAULT_API_URL,
  parseConfigFile,
  requireToken,
  resolveTarget,
  validateBaseUrl,
} from "../src/config.js";
import { CliUsageError } from "../src/errors.js";

const CONFIG = parseConfigFile(
  JSON.stringify({
    default: "prod",
    profiles: {
      prod: { apiUrl: "https://api.example.test" },
      local: { apiUrl: "http://127.0.0.1:3000" },
      bare: {},
    },
  }),
);

describe("parseConfigFile", () => {
  it("reads profiles and the default", () => {
    expect(CONFIG.default).toBe("prod");
    expect(CONFIG.profiles["local"]?.apiUrl).toBe("http://127.0.0.1:3000");
  });

  it.each([
    ["not JSON", "{", "not valid JSON"],
    ["an array", "[]", "must be a JSON object"],
    [
      "profiles that are not an object",
      '{"profiles": []}',
      "must be an object",
    ],
    [
      "a profile that is not an object",
      '{"profiles": {"a": 1}}',
      'Profile "a" must be an object',
    ],
    [
      "an apiUrl that is not a string",
      '{"profiles": {"a": {"apiUrl": 5}}}',
      "not a string",
    ],
    [
      "a default that is not a string",
      '{"default": 1}',
      "must be a profile name",
    ],
  ])("refuses %s", (_name, text, message) => {
    expect(() => parseConfigFile(text)).toThrow(CliUsageError);
    expect(() => parseConfigFile(text)).toThrow(message);
  });
});

describe("validateBaseUrl", () => {
  it("accepts https and local http, and strips trailing slashes", () => {
    expect(validateBaseUrl("https://a.test/")).toBe("https://a.test");
    expect(validateBaseUrl("http://localhost:8080")).toBe(
      "http://localhost:8080",
    );
  });

  it("refuses plain http to other hosts", () => {
    expect(() => validateBaseUrl("http://example.com")).toThrow(
      /must be https/,
    );
  });
});

describe("resolveTarget", () => {
  it("prefers --api-url over the environment and the profile", () => {
    const target = resolveTarget({
      flagProfile: undefined,
      flagApiUrl: "https://flag.test",
      env: { PARMANA_API_URL: "https://env.test" },
      config: CONFIG,
    });
    expect(target.baseUrl).toBe("https://flag.test");
  });

  it("uses PARMANA_API_URL when no flag is given", () => {
    const target = resolveTarget({
      flagProfile: undefined,
      flagApiUrl: undefined,
      env: { PARMANA_API_URL: "https://env.test" },
      config: CONFIG,
    });
    expect(target.baseUrl).toBe("https://env.test");
  });

  it("uses the profile named by --profile over the config default", () => {
    const target = resolveTarget({
      flagProfile: "local",
      flagApiUrl: undefined,
      env: {},
      config: CONFIG,
    });
    expect(target).toEqual({
      baseUrl: "http://127.0.0.1:3000",
      profile: "local",
    });
  });

  it("uses the config default profile when nothing else names one", () => {
    const target = resolveTarget({
      flagProfile: undefined,
      flagApiUrl: undefined,
      env: {},
      config: CONFIG,
    });
    expect(target.baseUrl).toBe("https://api.example.test");
  });

  it("falls back to production when there is no config file", () => {
    const target = resolveTarget({
      flagProfile: undefined,
      flagApiUrl: undefined,
      env: {},
      config: undefined,
    });
    expect(target.baseUrl).toBe(DEFAULT_API_URL);
  });

  it("refuses an unknown profile named on the command line", () => {
    expect(() =>
      resolveTarget({
        flagProfile: "nope",
        flagApiUrl: undefined,
        env: {},
        config: CONFIG,
      }),
    ).toThrow(/No profile named "nope"/);
  });
});

describe("requireToken and configPath", () => {
  it("reads PARMANA_TOKEN and refuses when it is missing", () => {
    expect(requireToken({ PARMANA_TOKEN: " t " })).toBe("t");
    expect(() => requireToken({})).toThrow(/Set PARMANA_TOKEN/);
  });

  it("uses PARMANA_CONFIG, or the home folder by default", () => {
    expect(configPath({ PARMANA_CONFIG: "/x.json" }, "/home/u")).toBe(
      "/x.json",
    );
    expect(configPath({}, "/home/u")).toMatch(/\.parmana[\\/]config\.json$/);
  });
});

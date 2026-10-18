import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { warnIfHubSpotTokenStale } from "../../../src/bootstrap/warnIfHubSpotTokenStale.js";

const ENV_KEYS = [
  "HUBSPOT_PRIVATE_APP_TOKEN",
  "HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT",
] as const;

describe("warnIfHubSpotTokenStale", () => {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();

    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("does nothing when the HubSpot connector is not configured", () => {
    delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    delete process.env.HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT;

    warnIfHubSpotTokenStale();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns that the rotation date is unknown when it is unset", () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "pat-na1-token";
    delete process.env.HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT;

    warnIfHubSpotTokenStale();

    expect(console.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "hubspot_token_rotation_date_unknown" }),
    );
  });

  it("warns that the rotation date is invalid when it cannot be parsed", () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "pat-na1-token";
    process.env.HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT = "not-a-date";

    warnIfHubSpotTokenStale();

    expect(console.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "hubspot_token_rotation_date_invalid" }),
    );
  });

  it("stays silent when the token was rotated recently", () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "pat-na1-token";
    process.env.HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT =
      "2026-08-15T00:00:00.000Z";

    warnIfHubSpotTokenStale(new Date("2026-09-10T00:00:00.000Z"), 90);

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("warns with the token's age when it exceeds the max age", () => {
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "pat-na1-token";
    process.env.HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT =
      "2026-01-01T00:00:00.000Z";

    warnIfHubSpotTokenStale(new Date("2026-09-10T00:00:00.000Z"), 90);

    expect(console.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "hubspot_token_stale", maxAgeDays: 90 }),
    );
  });
});

import { describe, expect, it } from "vitest";

import { parseRevokeArguments } from "../../scripts/revoke-caller-key.js";

const KEY_HASH = "a".repeat(64);

const VALID_ARGS = [
  "--key-hash",
  KEY_HASH,
  "--caller-id",
  "agent-1",
  "--by",
  "operator-1",
  "--reason",
  "key exposed",
];

describe("parseRevokeArguments", () => {
  it("parses a complete set of arguments", () => {
    expect(parseRevokeArguments(VALID_ARGS)).toEqual({
      keyHash: KEY_HASH,
      callerId: "agent-1",
      revokedBy: "operator-1",
      reason: "key exposed",
    });
  });

  it("refuses a key hash that is not 64 lowercase hex characters", () => {
    expect(() =>
      parseRevokeArguments([
        "--key-hash",
        "not-a-hash",
        ...VALID_ARGS.slice(2),
      ]),
    ).toThrow(/--key-hash must be 64 lowercase hex/);

    expect(() =>
      parseRevokeArguments([
        "--key-hash",
        KEY_HASH.toUpperCase(),
        ...VALID_ARGS.slice(2),
      ]),
    ).toThrow(/--key-hash must be 64 lowercase hex/);
  });

  it("refuses a missing argument", () => {
    expect(() => parseRevokeArguments(VALID_ARGS.slice(2))).toThrow(
      /Missing argument: --key-hash/,
    );
  });

  it("refuses an empty argument value", () => {
    const withBlankCaller = VALID_ARGS.map((value) =>
      value === "agent-1" ? "   " : value,
    );

    expect(() => parseRevokeArguments(withBlankCaller)).toThrow(
      /--caller-id must not be empty/,
    );
  });
});

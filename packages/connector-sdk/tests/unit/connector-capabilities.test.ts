import { describe, expect, it } from "vitest";

import {
  connectorCapabilities,
  isNamespacedCapability,
} from "../../src/index.js";

describe("isNamespacedCapability", () => {
  it.each(["http:get", "crm:update-contact", "billing:issue_refund", "a1:b2"])(
    "accepts the namespaced verb %s",
    (capability) => {
      expect(isNamespacedCapability(capability)).toBe(true);
    },
  );

  it.each([
    ["a bare action", "get"],
    ["an empty namespace", ":read"],
    ["an empty verb", "crm:"],
    ["two separators", "crm:read:all"],
    ["an uppercase letter", "CRM:read"],
    ["a namespace starting with a digit", "1crm:read"],
    ["a trailing hyphen in the namespace", "crm-:read"],
    ["a doubled separator", "crm--read:get"],
    ["whitespace", "crm: read"],
  ])("rejects %s (%s)", (_description, capability) => {
    expect(isNamespacedCapability(capability)).toBe(false);
  });
});

describe("connectorCapabilities", () => {
  it("declares the namespaced verbs it was given", () => {
    const capabilities = connectorCapabilities([
      "crm:read",
      "crm:update-contact",
    ]);

    expect(capabilities.declared).toEqual(["crm:read", "crm:update-contact"]);
    expect(capabilities.includes("crm:read")).toBe(true);
    expect(capabilities.includes("crm:delete")).toBe(false);
  });

  it("fails at construction on a bare action, naming the capability", () => {
    expect(() => connectorCapabilities(["get"])).toThrow(
      'Connector capability must be a namespaced verb (e.g. "http:get"): "get".',
    );
  });

  it("fails at construction if any one declared capability is malformed", () => {
    expect(() =>
      connectorCapabilities(["crm:read", "crm:update-contact", "DELETE"]),
    ).toThrow('"DELETE"');
  });

  it("does not let a caller mutate the declared list after construction", () => {
    const source = ["crm:read"];
    const capabilities = connectorCapabilities(source);

    source.push("crm:delete");

    expect(capabilities.declared).toEqual(["crm:read"]);
    expect(capabilities.includes("crm:delete")).toBe(false);
  });
});

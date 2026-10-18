import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { HashAlgorithms } from "@parmana/shared";

import { SHA256HashProvider } from "../../src/providers/hash/SHA256HashProvider.js";

describe("SHA256HashProvider", () => {
  it("reports the sha256 algorithm identifier", () => {
    expect(new SHA256HashProvider().algorithm).toBe(HashAlgorithms.SHA256);
  });

  it("produces the known SHA-256 digest for a fixed input", async () => {
    const provider = new SHA256HashProvider();

    const digest = await provider.hash(Buffer.from("parmana"));

    const expected = createHash("sha256")
      .update(Buffer.from("parmana"))
      .digest("hex");

    expect(digest).toBe(expected);
    expect(digest).toBe(
      "c581ef3c077145ad5fd929b4f7c15418e835bd814bb7af8b7347f862b33aeb09",
    );
  });

  it("is stable: hashing the same input twice yields the same digest", async () => {
    const provider = new SHA256HashProvider();
    const input = Buffer.from("stable-input");

    const first = await provider.hash(input);
    const second = await provider.hash(input);

    expect(first).toBe(second);
  });

  it("produces different digests for different input", async () => {
    const provider = new SHA256HashProvider();

    const a = await provider.hash(Buffer.from("a"));
    const b = await provider.hash(Buffer.from("b"));

    expect(a).not.toBe(b);
  });
});

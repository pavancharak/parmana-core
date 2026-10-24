import { describe, expect, it } from "vitest";

import { escapeMdxUnsafeCharacters } from "../../scripts/python-sdk-reference/escapeMdx.js";

describe("escapeMdxUnsafeCharacters", () => {
  it("doubles a lone backslash so the next character is not read as an escape", () => {
    expect(escapeMdxUnsafeCharacters("C:\\path")).toBe("C:\\\\path");
    expect(escapeMdxUnsafeCharacters("a\\nb")).toBe("a\\\\nb");
  });

  it("keeps a backslash that already escapes punctuation, as pydoc writes it", () => {
    expect(escapeMdxUnsafeCharacters("\\_\\_init\\_\\_")).toBe(
      "\\_\\_init\\_\\_",
    );
    expect(escapeMdxUnsafeCharacters("\\*emphasis\\*")).toBe("\\*emphasis\\*");
  });

  it("does not double an escaped brace or add a second escape to it", () => {
    expect(escapeMdxUnsafeCharacters("\\{x\\}")).toBe("\\{x\\}");
  });

  it("escapes a bare brace", () => {
    expect(escapeMdxUnsafeCharacters("dict {a}")).toBe("dict \\{a\\}");
  });

  it("entity-encodes a < that opens a tag, and leaves a < before a space alone", () => {
    expect(escapeMdxUnsafeCharacters("<api_key>")).toBe("&lt;api_key>");
    expect(escapeMdxUnsafeCharacters("a < b")).toBe("a < b");
  });

  it("leaves fenced code untouched", () => {
    const input = "```\nC:\\path {x} <tag>\n```";
    expect(escapeMdxUnsafeCharacters(input)).toBe(input);
  });

  it("leaves frontmatter untouched", () => {
    const input = "---\ntitle: C:\\path {x}\n---\nbody {x}";
    expect(escapeMdxUnsafeCharacters(input)).toBe(
      "---\ntitle: C:\\path {x}\n---\nbody \\{x\\}",
    );
  });

  it("leaves pydoc's generated anchor tag untouched", () => {
    const input = '<a id="x"></a> {y}';
    expect(escapeMdxUnsafeCharacters(input)).toBe(input);
  });
});

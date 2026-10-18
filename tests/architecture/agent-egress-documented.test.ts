import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The egress requirement is a deployment rule, not code, so the best this
 * suite can do is keep it written down where operators read: the production
 * guide must state the rule and its checks, and the handbook must point to
 * it. A real egress test needs a running agent host (see the production
 * guide, "Agent network egress").
 */
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

function read(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("agent network egress is documented for operators", () => {
  const production = read("docs/site/deployment/production.mdx");
  const handbook = read("docs/site/handbook/21-deployment.mdx");

  it("the production guide states that outbound traffic is allowed only to the Parmana endpoint", () => {
    expect(production).toMatch(/## Agent network egress/);
    expect(production).toMatch(
      /Outbound traffic is allowed only to the Parmana endpoint/,
    );
  });

  it("the production guide states that connector credentials stay off agent hosts", () => {
    expect(production).toMatch(
      /No connector credential is present on an agent host/,
    );
  });

  it("the production guide gives the commands that check direct egress is blocked", () => {
    expect(production).toMatch(
      /curl --max-time 5 https:\/\/api\.hubapi\.com\//,
    );
    expect(production).toMatch(
      /curl --max-time 5 https:\/\/api\.github\.com\//,
    );
  });

  it("the handbook deployment chapter points to the requirement", () => {
    expect(handbook).toMatch(/### Agent network egress/);
    expect(handbook).toMatch(/production guide under "Agent network egress"/);
  });
});

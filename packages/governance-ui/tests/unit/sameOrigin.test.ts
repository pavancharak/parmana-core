import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

import { requireSameOrigin } from "../../src/middleware/sameOrigin.js";

function run(
  method: string,
  headers: Record<string, string | undefined>,
  host = "ui.example.test",
) {
  const req = {
    method,
    get: (name: string) => {
      const key = name.toLowerCase();
      if (key === "host") return host;
      return headers[key];
    },
  } as unknown as Request;

  const status = vi.fn().mockReturnThis();
  const send = vi.fn();
  const res = { status, send } as unknown as Response;
  const next = vi.fn();

  requireSameOrigin(req, res, next);
  return { next, status, send };
}

describe("requireSameOrigin", () => {
  it("lets safe methods through regardless of origin", () => {
    const { next } = run("GET", { origin: "https://evil.example" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows a POST whose Origin host matches", () => {
    const { next } = run("POST", { origin: "https://ui.example.test" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("ignores the scheme when the proxy terminates TLS", () => {
    const { next } = run(
      "POST",
      { origin: "https://ui.example.test" },
      "ui.example.test",
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("refuses a POST from another origin", () => {
    const { next, status, send } = run("POST", {
      origin: "https://evil.example",
    });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith("Cross-site request refused.");
  });

  it("refuses a POST with a malformed Origin", () => {
    const { next, status } = run("POST", { origin: "not a url" });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("refuses a POST that a browser marks cross-site", () => {
    const { next, status } = run("POST", { "sec-fetch-site": "cross-site" });
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("allows a POST from a non-browser client with no origin headers", () => {
    const { next } = run("POST", {});
    expect(next).toHaveBeenCalledOnce();
  });
});

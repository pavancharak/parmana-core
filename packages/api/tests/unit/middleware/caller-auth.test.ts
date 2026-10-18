import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

import { createCallerAuthMiddleware } from "../../../src/middleware/caller-auth.js";
import { AuditUnavailableError } from "../../../src/auth/AuditUnavailableError.js";
import type { CallerAuthenticator } from "../../../src/auth/CallerAuthenticator.js";
import type {
  CallerAuditEvent,
  CallerAuditSink,
} from "../../../src/auth/CallerAuditSink.js";

function createMockReq(authorization: string | undefined): Request {
  return {
    headers: { authorization },
    originalUrl: "/execute",
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

const VALID_AUTHENTICATOR: CallerAuthenticator = {
  authenticate: (credential) =>
    credential === "good-key" ? { callerId: "caller-1" } : undefined,
};

/**
 * Unit coverage for the G-1-adjacent audit fail-closed decision:
 * an audit-write failure must reject the request with a named,
 * typed error rather than let it proceed unaudited or crash as an
 * unhandled rejection. See docs/VERIFICATION-GAPS.md for the
 * decision record and packages/api/src/auth/AuditUnavailableError.ts
 * for why this extends RuntimeError.
 */
describe("createCallerAuthMiddleware — audit fail-closed", () => {
  it("success path unchanged: valid credential, sink records, next() called with no error", async () => {
    const events: CallerAuditEvent[] = [];
    const sink: CallerAuditSink = {
      record: async (event) => {
        events.push(event);
      },
    };

    const middleware = createCallerAuthMiddleware(VALID_AUTHENTICATOR, sink);
    const req = createMockReq("Bearer good-key");
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("caller.authenticated");
    expect(res.status).not.toHaveBeenCalled();
  });

  it("success path unchanged: missing credential, sink records, 401 returned", async () => {
    const events: CallerAuditEvent[] = [];
    const sink: CallerAuditSink = {
      record: async (event) => {
        events.push(event);
      },
    };

    const middleware = createCallerAuthMiddleware(VALID_AUTHENTICATOR, sink);
    const req = createMockReq(undefined);
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      "WWW-Authenticate",
      'Bearer realm="Parmana"',
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("caller.rejected");
  });

  it("(fail-closed) a valid credential whose audit write fails is rejected with AuditUnavailableError, not let through", async () => {
    const sink: CallerAuditSink = {
      record: async () => {
        throw new Error("storage unreachable");
      },
    };

    const middleware = createCallerAuthMiddleware(VALID_AUTHENTICATOR, sink);
    const req = createMockReq("Bearer good-key");
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(AuditUnavailableError);
    expect(errorArg.status).toBe(503);
    expect(errorArg.code).toBe("AUDIT_UNAVAILABLE");

    // Never reaches the route (no bare next()) and is not masked as a 401 —
    // it fails closed as its own distinct error, not silently continuing.
    expect(res.status).not.toHaveBeenCalled();
  });

  it("(fail-closed) a rejected credential whose audit write also fails is rejected with AuditUnavailableError, not silently 401'd", async () => {
    const sink: CallerAuditSink = {
      record: async () => {
        throw new Error("storage unreachable");
      },
    };

    const middleware = createCallerAuthMiddleware(VALID_AUTHENTICATOR, sink);
    const req = createMockReq(undefined);
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorArg = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(errorArg).toBeInstanceOf(AuditUnavailableError);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("logs a structured entry distinguishing an audit failure from other failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const sink: CallerAuditSink = {
      record: async () => {
        throw new Error("connection refused");
      },
    };

    const middleware = createCallerAuthMiddleware(VALID_AUTHENTICATOR, sink);
    const req = createMockReq("Bearer good-key");
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toMatchObject({
      event: "caller_audit_write_failed",
      route: "/execute",
      error: "connection refused",
    });

    errorSpy.mockRestore();
  });

  it("does not retry, buffer, or queue: the sink is called exactly once even though it fails", async () => {
    let callCount = 0;

    const sink: CallerAuditSink = {
      record: async () => {
        callCount += 1;
        throw new Error("storage unreachable");
      },
    };

    const middleware = createCallerAuthMiddleware(VALID_AUTHENTICATOR, sink);
    const req = createMockReq("Bearer good-key");
    const res = createMockRes();
    const next = vi.fn() as unknown as NextFunction;

    await middleware(req, res, next);

    expect(callCount).toBe(1);
  });
});

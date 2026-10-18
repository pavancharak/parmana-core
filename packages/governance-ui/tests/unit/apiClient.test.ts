import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  ApiUnreachableError,
  fetchCallerIdentity,
  fetchPendingChanges,
} from "../../src/apiClient.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("fetchCallerIdentity", () => {
    it("sends the key as a Bearer token and returns the identity on success", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, {
          callerId: "human-checker-1",
          allowedPrincipalIds: [],
          allowedCapabilities: [],
          unrestrictedCapabilities: false,
        }),
      );

      const identity = await fetchCallerIdentity(
        "http://api.example",
        "raw-key",
      );

      expect(identity.callerId).toBe("human-checker-1");
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://api.example/callers/me",
        expect.objectContaining({
          headers: { Authorization: "Bearer raw-key" },
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it("throws ApiClientError with status 401 on an invalid key", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(401, { error: "Invalid or missing API key." }),
      );

      await expect(
        fetchCallerIdentity("http://api.example", "bad-key"),
      ).rejects.toMatchObject({
        constructor: ApiClientError,
        status: 401,
      });
    });

    it("throws ApiUnreachableError when the network request itself fails", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("ECONNREFUSED"),
      );

      await expect(
        fetchCallerIdentity("http://api.example", "any-key"),
      ).rejects.toBeInstanceOf(ApiUnreachableError);
    });
  });

  describe("fetchPendingChanges", () => {
    it("returns the changes array from the response envelope", async () => {
      const changes = [
        {
          pendingPolicyChangeId: "ppc-1",
          policyName: "vendor-payment",
          policyVersion: "2.0.0",
          proposedContent: { policyId: "vendor-payment" },
          proposedBy: "human-maker",
          proposedAt: "2026-08-01T00:00:00.000Z",
          status: "PENDING_APPROVAL",
          reason: "test",
          diff: { current: null, proposed: { policyId: "vendor-payment" } },
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { changes }),
      );

      const result = await fetchPendingChanges("http://api.example", "key");

      expect(result).toEqual(changes);
    });

    it("throws ApiClientError with the API's own error message on a non-2xx response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(403, {
          error: "Caller authentication is required.",
          code: "NON_HUMAN_CALLER_DENIED",
        }),
      );

      await expect(
        fetchPendingChanges("http://api.example", "key"),
      ).rejects.toMatchObject({
        constructor: ApiClientError,
        status: 403,
        message: "Caller authentication is required.",
      });
    });

    it("falls back to a generic message when the error body has no 'error' field", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("not json", { status: 500 }),
      );

      await expect(
        fetchPendingChanges("http://api.example", "key"),
      ).rejects.toMatchObject({
        status: 500,
      });
    });
  });
});

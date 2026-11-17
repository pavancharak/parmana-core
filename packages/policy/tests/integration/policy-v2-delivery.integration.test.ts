import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveDatabaseGate } from "../../../../test-support/database-gate.js";
import {
  acquirePolicyV2SuiteLock,
  releasePolicyV2SuiteLock,
} from "../helpers/policy-v2-database-lock.js";
import { PolicyV2DeliveryStore } from "../../src/v2/persistence.js";

/** Delivery events from SES, stored once each, against a real database. */

const databaseConfigured = resolveDatabaseGate("Policy v2 delivery");

describe.skipIf(!databaseConfigured)(
  "policy v2 delivery events (live database)",
  () => {
    let pool: Pool;
    let store: PolicyV2DeliveryStore;
    let lock: PoolClient | undefined;

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
      lock = await acquirePolicyV2SuiteLock(pool);
      store = new PolicyV2DeliveryStore(pool);
    });

    beforeEach(async () => {
      await pool.query("TRUNCATE policy_v2_delivery_events");
    });

    afterAll(async () => {
      await releasePolicyV2SuiteLock(lock!);
      await pool.end();
    });

    const bounce = (key: string, recipient: string, type: string) => ({
      eventKey: key,
      eventType: "Bounce" as const,
      bounceType: type,
      sesMessageId: "ses-1",
      recipient,
      detail: {},
    });

    it("stores an event once, however many times SNS delivers it", async () => {
      const first = await store.recordEvents([
        bounce("sns-1/a@example.com", "a@example.com", "Transient"),
      ]);
      const again = await store.recordEvents([
        bounce("sns-1/a@example.com", "a@example.com", "Transient"),
      ]);
      expect(first).toEqual(["sns-1/a@example.com"]);
      expect(again).toEqual([]);
    });

    it("suppresses an address after a permanent bounce, and not after a transient one", async () => {
      await store.recordEvents([
        bounce("sns-2/b@example.com", "b@example.com", "Transient"),
      ]);
      expect(await store.isSuppressed("b@example.com")).toBe(false);
      await store.recordEvents([
        bounce("sns-3/b@example.com", "B@example.com", "Permanent"),
      ]);
      expect(await store.isSuppressed("b@example.com")).toBe(true);
    });

    it("refuses to change or remove a stored event", async () => {
      await store.recordEvents([
        bounce("sns-4/c@example.com", "c@example.com", "Permanent"),
      ]);
      await expect(
        pool.query(
          "UPDATE policy_v2_delivery_events SET bounce_type = 'Transient'",
        ),
      ).rejects.toThrow(/append only/);
      await expect(
        pool.query("DELETE FROM policy_v2_delivery_events"),
      ).rejects.toThrow(/append only/);
    });
  },
);

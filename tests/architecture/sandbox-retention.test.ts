import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The sandbox's retention job (deploy/sandbox/retention.sql, ADR-0014 open
 * question 3) deletes old Business Transactions. Every table that
 * references business_transactions does so ON DELETE RESTRICT, so the job
 * must delete from each of them first, or the daily run fails. These tests
 * read the migrations, so a new table that references business_transactions
 * fails here until the job deletes from it too. They also keep the job's
 * guards: it refuses a database without the sandbox registration, keeps
 * governance, and is never a migration.
 */

const root = process.cwd();
const sql = readFileSync(
  path.join(root, "deploy", "sandbox", "retention.sql"),
  "utf8",
);
const migrationsDir = path.join(root, "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

function tablesReferencingBusinessTransactions(): string[] {
  const tables: string[] = [];
  const create = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\);/gi;

  for (const match of migrations.matchAll(create)) {
    const [, name, body] = match;

    if (
      name !== "business_transactions" &&
      /REFERENCES\s+business_transactions\s*\(/i.test(body ?? "")
    ) {
      tables.push(name as string);
    }
  }
  return tables;
}

function deleteIndex(table: string): number {
  return sql.search(new RegExp(`DELETE FROM ${table}\\b`));
}

describe("the sandbox retention job", () => {
  const children = tablesReferencingBusinessTransactions();

  it("finds the tables that reference business_transactions", () => {
    expect(children).toEqual(
      expect.arrayContaining([
        "executions",
        "execution_trust_records",
        "refusal_records",
        "execution_intents",
      ]),
    );
  });

  it.each(children)("deletes from %s before business_transactions", (table) => {
    expect(deleteIndex(table)).toBeGreaterThan(-1);
    expect(deleteIndex(table)).toBeLessThan(
      deleteIndex("business_transactions"),
    );
  });

  it("refuses to delete in a database without the sandbox registration", () => {
    expect(sql).toMatch(
      /IF NOT EXISTS \(\s*SELECT 1 FROM external_connectors\s*WHERE capability = 'sandbox:receipt' AND status = 'active'\s*\) THEN\s*RAISE EXCEPTION/,
    );
    expect(sql.indexOf("RAISE EXCEPTION 'Not the sandbox")).toBeLessThan(
      sql.indexOf("DELETE FROM"),
    );
  });

  it("never deletes governance", () => {
    for (const table of [
      "policies",
      "pending_policy_changes",
      "policy_change_approval_records",
      "approval_issuers",
      "approval_issuer_changes",
      "external_connectors",
      "external_connector_changes",
      "business_signal_sources",
      "business_signal_source_changes",
      "authority_grants",
      "authority_grant_changes",
      "consumed_policy_change_step_up_nonces",
    ]) {
      expect(deleteIndex(table)).toBe(-1);
    }
  });

  it("runs daily with a 7 day period", () => {
    expect(sql).toContain(
      "'parmana-sandbox-retention',\n    '30 3 * * *',\n    'SELECT * FROM parmana_sandbox_retention(7)'",
    );
  });

  it("is not a migration, so it can never reach production", () => {
    expect(migrations).not.toContain("parmana_sandbox_retention");
  });
});

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Phase 1G — lightweight documentation-reference validation.
 *
 * Not a prose/content checker (too heavyweight, too brittle for what this
 * needs to catch). Just the cheap, high-value check: every backtick-quoted
 * file path these architecture docs cite as evidence must actually exist.
 * A doc that says "see packages/foo/src/Bar.ts" about a file that got
 * renamed or deleted is worse than no citation at all — this catches that
 * the next time the doc (or the file) changes, instead of silently rotting.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const docsToCheck = [
  "docs/architecture/system-architecture.md",
  "docs/connectors/BUILDING_A_CONNECTOR.md",
  "docs/architecture/repository-invariants.md",
  "docs/CLAIMS.md",
];

/**
 * Backtick-quoted paths that look like a real repo path (package src/tests,
 * tests/architecture, docs/*.md, policies/, or one of the other path shapes
 * CLAIMS.md's own Evidence sections actually cite: examples/, scripts/,
 * supabase/migrations/, and .github/workflows/).
 */
const PATH_PATTERN =
  /`((?:packages\/[\w-]+\/(?:src|tests)\/[\w\-./]+\.tsx?)|(?:tests\/architecture\/[\w\-./]+\.tsx?)|(?:docs\/[\w\-./]+\.md)|(?:policies\/?)|(?:examples\/[\w\-./]+\.tsx?)|(?:scripts\/[\w\-./]+\.(?:ts|mjs|sh))|(?:supabase\/migrations\/[\w\-./]+\.sql)|(?:\.github\/workflows\/[\w\-./]+\.ya?ml))`/g;

/**
 * Paths that are deliberately hypothetical, not evidence: either a "Regression
 * example" describing a file that must NOT exist (repository-invariants.md),
 * or a worked "how you'd add a new vendor" walkthrough using a not-yet-built
 * Stripe connector as the illustrative example (repository-invariants.md). Real
 * evidence citations still get checked; only these named, intentional
 * hypotheticals are excluded.
 */
const HYPOTHETICAL_EXAMPLE_PATHS = new Set([
  // docs/CLAIMS.md §2.35: a prior implementation runbook assumed this
  // was the real execution-gateway choke point; it never existed --
  // the section cites it specifically to record and correct that
  // mistaken assumption (the real one is RuntimeEngine.execute()),
  // not as evidence of something built.
  "packages/api/src/execution-gateway/ExecutionGateway.ts",
  "packages/connector-stripe/src/StripeCapabilities.ts",
  "packages/execution-gateway/src/connector-execution/GatewayStripeAdapter.ts",
  "packages/execution-gateway/src/connector-execution/createGatewayStripeConnector.ts",
  "packages/api/src/bootstrap/createStripeConnector.ts",
  "packages/connector-stripe/src/StripeConnector.ts",
  "packages/api/src/routes/admin-replay.ts",
]);

/**
 * Paths that were real when cited, describing a genuine historical fact
 * (unlike HYPOTHETICAL_EXAMPLE_PATHS above, which were never real), but
 * whose subject was later deliberately removed rather than renamed or
 * fixed. The doc's own narrative is the historical record of what was
 * true at the time and why it changed — rewriting the citation itself
 * would falsify that record. `payments:execute`/vendor-payment was
 * removed outright, not independently verified (docs/VERIFICATION-GAPS.md
 * G-27) — `createVendorPaymentConnector.ts` and its dedicated credential
 * provider no longer exist anywhere in this repository. The same applies
 * to the Razorpay connector, deliberately removed in full (see the
 * removal commit and docs/CLAIMS.md's historical §3.4-3.9/3.8/3.9).
 */
const HISTORICALLY_REAL_NOW_REMOVED_PATHS = new Set([
  "packages/api/src/bootstrap/createVendorPaymentConnector.ts",
  "packages/api/src/webhooks/RazorpaySettlementProcessor.ts",
  "packages/api/src/bootstrap/createRazorpaySignalStateVerifier.ts",
  "packages/connector-sdk/src/connectors/razorpay/RazorpayCapabilities.ts",
  // Surfaced when docs/CLAIMS.md and a wider PATH_PATTERN were added to
  // this check (G-31 docs pass) -- each is explicitly self-caveated in
  // its own doc as a historical citation, not a currently-resolvable path.
  "packages/api/tests/integration/razorpay-refund.integration.test.ts",
  "packages/storage/tests/integration/supabase-razorpay-daily-refund-ledger.integration.test.ts",
  "scripts/process-razorpay-settlements.ts",
  // "as originally shipped ... see the Phase 1C update below for where
  // this logic lives today" -- moved/refactored during Phase 1C, not
  // deleted, but no longer resolvable at this original path.
  "packages/connector-hubspot/src/HubSpotConnector.ts",
  // docs/CLAIMS.md §2.34: unexported, unimported dead code, deleted as
  // part of the same fix the section documents (commit 437f5ec).
  "packages/policy/src/types/LedgerEntry.ts",
]);

function extractReferencedPaths(content: string): string[] {
  const matches = [...content.matchAll(PATH_PATTERN)].map((m) => m[1]!);
  return [...new Set(matches)].filter(
    (path) =>
      !HYPOTHETICAL_EXAMPLE_PATHS.has(path) &&
      !HISTORICALLY_REAL_NOW_REMOVED_PATHS.has(path),
  );
}

describe("documentation file references resolve to real files", () => {
  for (const docPath of docsToCheck) {
    const absPath = join(repoRoot, docPath);

    it(`${docPath} exists`, () => {
      expect(existsSync(absPath)).toBe(true);
    });

    if (!existsSync(absPath)) continue;

    const content = readFileSync(absPath, "utf8");
    const referencedPaths = extractReferencedPaths(content);

    it(`${docPath} cites at least one file path (sanity check the scan isn't vacuous)`, () => {
      expect(referencedPaths.length).toBeGreaterThan(0);
    });

    it.each(referencedPaths)(
      `${docPath} references %s, which exists`,
      (referencedPath) => {
        const cleaned = referencedPath.endsWith("/")
          ? referencedPath.slice(0, -1)
          : referencedPath;
        expect(existsSync(join(repoRoot, cleaned))).toBe(true);
      },
    );
  }
});

/**
 * Extension of the same check above, for a different citation shape: prose
 * naming a CLAIMS.md section number (`CLAIMS.md 3.8`, `` `CLAIMS.md` §3.4 ``,
 * `[CLAIMS.md 3.6](docs/CLAIMS.md)`, `CLAIMS.md 3.6 through 3.9`, etc. — no
 * single exact phrase covers every citation style actually in use, so this
 * matches on proximity: any `N.M` token found shortly after the literal
 * string "CLAIMS.md" on the same line) rather than a file path. Two real
 * instances of this exact bug surfaced during the Razorpay removal
 * (2026-08-12): a citation to `3.4` and an implied `3.6 through 3.9` range,
 * both pointing at sections deleted outright (not renumbered) alongside the
 * connector. A follow-up scan of the whole repo found two more — including
 * docs/CLAIMS.md citing its own deleted §3.4 — confirming this rots
 * silently and is worth guarding, same as the path check above.
 *
 * Scope is deliberately the living, currently-accurate documentation
 * surface only: docs/CLAIMS.md itself, the customer/investor-facing docs
 * site (docs/site/**\/*.mdx), and the root-level docs that track the same
 * present-tense state (README.md, SECURITY.md). The
 * audit-trail (docs/VERIFICATION-GAPS.md, docs/architecture/phase*.md,
 * etc.) is deliberately excluded, for the same reason
 * docsToCheck above never included them: those are dated investigation
 * logs that correctly cite a section number as it existed at the time of
 * writing, not living documentation expected to track the present.
 *
 * No allowlist for intentional historical section citations exists here
 * (unlike HISTORICALLY_REAL_NOW_REMOVED_PATHS above) because none of the
 * citations found when this check was written were deliberate — every one
 * was ordinary staleness from an unrelated deletion, not a citation
 * authored with foreknowledge that its target would later be removed. If a
 * genuine case like that shows up, follow HISTORICALLY_REAL_NOW_REMOVED_PATHS's
 * precedent above rather than building something new.
 */

const CLAIMS_MD_PATH = "docs/CLAIMS.md";

/** Every .mdx file under a directory, recursively, as repo-relative forward-slash paths. */
function collectMdxFiles(relDir: string): string[] {
  const absDir = join(repoRoot, relDir);
  if (!existsSync(absDir)) return [];

  const out: string[] = [];
  for (const entry of readdirSync(absDir)) {
    const relPath = join(relDir, entry);
    if (statSync(join(repoRoot, relPath)).isDirectory()) {
      out.push(...collectMdxFiles(relPath));
    } else if (extname(entry) === ".mdx") {
      out.push(relPath.split("\\").join("/"));
    }
  }
  return out;
}

const CITATION_DOCS = [
  CLAIMS_MD_PATH,
  "README.md",
  "SECURITY.md",
  ...collectMdxFiles("docs/site"),
];

/** How far past the literal "CLAIMS.md" a section-number token is still considered a citation of it, not an unrelated nearby number. Bounded to one line, never crosses a line break. */
const CITATION_WINDOW_CHARS = 80;

interface SectionCitation {
  line: number;
  number: string;
  snippet: string;
}

function extractSectionCitations(content: string): SectionCitation[] {
  const citations: SectionCitation[] = [];

  content.split("\n").forEach((lineText, index) => {
    for (const claimsMatch of lineText.matchAll(/CLAIMS\.md/g)) {
      const windowStart = claimsMatch.index! + claimsMatch[0].length;
      const window = lineText.slice(
        windowStart,
        windowStart + CITATION_WINDOW_CHARS,
      );

      for (const numberMatch of window.matchAll(/\d+\.\d+/g)) {
        citations.push({
          line: index + 1,
          number: numberMatch[0],
          snippet: lineText.trim().slice(0, 160),
        });
      }
    }
  });

  return citations;
}

/** Every `## N.M` / `### N.M` header currently in docs/CLAIMS.md — read live, not a hardcoded copy that could itself drift. */
function currentClaimsMdSectionNumbers(): Set<string> {
  const content = readFileSync(join(repoRoot, CLAIMS_MD_PATH), "utf8");
  const numbers = new Set<string>();

  for (const match of content.matchAll(/^#{2,3}\s+(\d+\.\d+)/gm)) {
    numbers.add(match[1]!);
  }

  return numbers;
}

describe("CLAIMS.md section citations resolve to real headers", () => {
  const claimsSections = currentClaimsMdSectionNumbers();

  it("docs/CLAIMS.md has at least one numbered section (sanity check the scan isn't vacuous)", () => {
    expect(claimsSections.size).toBeGreaterThan(0);
  });

  for (const docPath of CITATION_DOCS) {
    const absPath = join(repoRoot, docPath);
    if (!existsSync(absPath)) continue;

    const content = readFileSync(absPath, "utf8");
    const citations = extractSectionCitations(content);

    if (citations.length === 0) continue;

    it.each(citations)(
      `${docPath}:$line cites CLAIMS.md $number, which is a real header`,
      ({ number }) => {
        expect(claimsSections.has(number)).toBe(true);
      },
    );
  }
});

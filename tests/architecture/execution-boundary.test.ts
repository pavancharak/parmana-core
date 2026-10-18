import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Phase 1E — permanent architecture enforcement.
 *
 * These tests do not verify today's implementation; they verify the
 * INVARIANT: there is exactly one production execution pipeline
 * (RuntimeEngine -> ExecutionGateway.execute() -> Gateway-owned Adapter),
 * and nothing outside execution-gateway owns production execution. Every
 * check below scans `packages/*\/src` generically (not a fixed file list),
 * so a new package or a new file introducing a second execution path is
 * caught automatically, not just today's known files.
 *
 * Each allowlist is a closed, named set of pre-approved exceptions with a
 * one-line reason. Anything not on a list is a violation and fails the
 * build. Widening a list is a deliberate, reviewable code change — not
 * something that happens by accident.
 */

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packagesDir = join(repoRoot, "packages");

function listPackages(): string[] {
  return readdirSync(packagesDir).filter((name) =>
    statSync(join(packagesDir, name)).isDirectory(),
  );
}

/** Recursively lists .ts source files under `dir`, skipping node_modules/dist. */
function listTsFiles(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];

  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...listTsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      results.push(full);
    }
  }

  return results;
}

function toRepoRelative(absPath: string): string {
  return relative(repoRoot, absPath).split("\\").join("/");
}

/** All production `src/` files across every package, keyed by repo-relative path. */
function allPackageSrcFiles(): ReadonlyMap<string, string> {
  const files = new Map<string, string>();

  for (const pkg of listPackages()) {
    const srcDir = join(packagesDir, pkg, "src");
    for (const file of listTsFiles(srcDir)) {
      files.set(toRepoRelative(file), readFileSync(file, "utf8"));
    }
  }

  return files;
}

describe("execution boundary — exactly one production execution pipeline", () => {
  const srcFiles = allPackageSrcFiles();

  it("found production source files to scan (sanity check the scan itself isn't vacuous)", () => {
    expect(srcFiles.size).toBeGreaterThan(50);
  });

  describe("adapter ownership: only execution-gateway may implement Connector", () => {
    // The 2-arg Connector (execute(request, context)) from @parmana/connector-sdk is the
    // shape real vendor adapters implement. The 1-arg Connector from
    // @parmana/execution-gateway's own Connector.ts is the legacy/generic extension
    // point (HttpConnector, the connector-runtime subsystem) — also gateway-owned.
    const allowedImplementors = new Set<string>([
      "packages/execution-gateway/src/HttpConnector.ts",
      "packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts",
      "packages/execution-gateway/src/connector-execution/GatewayHttpAdapter.ts",
      // GitHub connector (Claim 1 audit follow-up, 2026-08-19): pull
      // request fetch/merge, proving the credential-isolation pattern
      // against a structurally different (ephemeral, JWT-minted) model
      // than HubSpot's static token. Same Phase 1C shape: capability
      // identifiers/DTOs live in @parmana/connector-github, only the
      // executable class lives here. Not yet wired into production
      // bootstrap (no policy file, no createGitHubConnector.ts
      // registration) — scaffold and hermetic tests only.
      "packages/execution-gateway/src/connector-execution/GatewayGitHubAdapter.ts",
      // Paytm refund connector: a REMOTE connector (forwards an
      // already-authorized paytm:refund ConnectorRequest to a separate,
      // trusted, out-of-process Paytm connector service over HTTPS,
      // never calling Paytm's own API in-process) — see
      // docs/connectors/PAYTM_CONNECTOR.md and docs/CLAIMS.md §3.22.
      // Same Phase 1C shape as HubSpot/GitHub: capability
      // identifiers/DTOs live in @parmana/connector-paytm, only the
      // executable class lives here.
      "packages/execution-gateway/src/connector-execution/GatewayPaytmAdapter.ts",
      // Slack connector: posts a message via Slack's real chat.postMessage
      // Web API, in-process (like HubSpot/GitHub, not a remote-proxy
      // pattern like Paytm). Same Phase 1C shape: capability
      // identifiers/DTOs live in @parmana/connector-slack, only the
      // executable class lives here.
      "packages/execution-gateway/src/connector-execution/GatewaySlackAdapter.ts",
      // External connector (ADR-0013): releases an approved request to an
      // operator's registered HTTPS endpoint as a signed release, the
      // remote pattern Paytm uses, made general. It lives here with the
      // other adapters and runs only through the Gateway pipeline.
      "packages/execution-gateway/src/connector-execution/GatewayExternalAdapter.ts",
      // Explicit, intentional test double — never executes a real vendor
      // call. Constructed by production bootstrap (createVendorPaymentConnector.ts,
      // via createConnectorRegistry.ts) ONLY when NODE_ENV=test; outside test
      // mode it returns undefined and "vendor-payment" is not registered at
      // all, so payments:execute fails closed like any other unimplemented
      // capability (Phase 2A — see
      // the Phase 2A production connectors record (in git history); the prior
      // unconditional-registration gap is documented in
      // §8 of the Phase 1E execution pipeline report (in git history) and
      // §4.9/TD-1 of the repository certification record (in git history) as the
      // finding this fixed). Still the one class outside execution-gateway
      // allowed to `implement Connector`; when it is constructed, it flows
      // through the full ExecutionGateway pipeline like any other.
      "packages/connector-sdk/src/MockConnector.ts",
    ]);

    const implementors = [...srcFiles.entries()]
      .filter(([, content]) => /\bimplements\s+Connector\b/.test(content))
      .map(([path]) => path);

    it("every `implements Connector` in packages/*/src is on the approved list", () => {
      const unapproved = implementors.filter(
        (path) => !allowedImplementors.has(path),
      );
      expect(unapproved).toEqual([]);
    });

    it("every file outside packages/execution-gateway implementing Connector is the named MockConnector exception", () => {
      const outsideGateway = implementors.filter(
        (path) => !path.startsWith("packages/execution-gateway/"),
      );
      expect(outsideGateway).toEqual([
        "packages/connector-sdk/src/MockConnector.ts",
      ]);
    });
  });

  describe("no direct connector.execute()/adapter.execute() call outside approved gateway-owned components", () => {
    // Matches call sites like `connector.execute(`, `this.options.connector.execute(`
    // — not method *definitions* (which look like `execute(request...) {`).
    const callSitePattern = /\bconnector\.execute\(|\badapter\.execute\(/;

    const allowedCallers = new Set<string>([
      // Canonical dispatch, stage 1: ExecutionControlService resolves a
      // SecureConnector from the registry and calls SecureConnector.execute()
      // — this is the execution-control abstraction (policy/session/credential
      // checks), not the raw vendor Connector.
      "packages/execution-control/src/ExecutionControlService.ts",
      // Canonical dispatch, stage 2: after policy/authorization/credential
      // checks pass, SdkConnectorExecutor calls the raw vendor Connector.
      "packages/execution-gateway/src/connector-execution/SdkConnectorExecutor.ts",
    ]);

    const callers = [...srcFiles.entries()]
      .filter(([, content]) => callSitePattern.test(content))
      .map(([path]) => path);

    it("every connector.execute()/adapter.execute() call site is on the approved list", () => {
      const unapproved = callers.filter((path) => !allowedCallers.has(path));
      expect(unapproved).toEqual([]);
    });
  });

  describe("RuntimeEngine cannot bypass ExecutionGateway", () => {
    const path = "packages/runtime/src/RuntimeEngine.ts";
    const content = srcFiles.get(path);

    it("RuntimeEngine.ts exists and was scanned", () => {
      expect(content).toBeDefined();
    });

    it("does not import execution-gateway, connector-sdk, or connector-hubspot", () => {
      expect(content).not.toMatch(/from ["']@parmana\/execution-gateway["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-sdk["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-hubspot["']/);
    });

    it("does not construct a Gateway/Connector/Http adapter or call fetch() directly", () => {
      expect(content).not.toMatch(/new (Gateway|Connector|Http|HubSpot)\w*\(/);
      expect(content).not.toMatch(/\bfetch\(/);
    });
  });

  describe("ExecutionTrustApplication cannot bypass ExecutionGateway", () => {
    const path = "packages/runtime/src/ExecutionTrustApplication.ts";
    const content = srcFiles.get(path);

    it("ExecutionTrustApplication.ts exists and was scanned", () => {
      expect(content).toBeDefined();
    });

    it("does not import execution-gateway, connector-sdk, or connector-hubspot", () => {
      expect(content).not.toMatch(/from ["']@parmana\/execution-gateway["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-sdk["']/);
      expect(content).not.toMatch(/from ["']@parmana\/connector-hubspot["']/);
    });

    it("does not construct a Gateway/Connector/Http adapter or call fetch() directly", () => {
      expect(content).not.toMatch(/new (Gateway|Connector|Http|HubSpot)\w*\(/);
      expect(content).not.toMatch(/\bfetch\(/);
    });
  });

  describe("API routes never execute adapters directly", () => {
    const routeFiles = [...srcFiles.entries()].filter(([path]) =>
      path.startsWith("packages/api/src/routes/"),
    );

    it("found route files to scan", () => {
      expect(routeFiles.length).toBeGreaterThan(0);
    });

    it.each(routeFiles)(
      "%s does not import or construct an adapter",
      (path, content) => {
        expect(content).not.toMatch(/from ["']@parmana\/execution-gateway["']/);
        expect(content).not.toMatch(/new (Gateway|HubSpot)\w*Adapter\(/);
        expect(content).not.toMatch(/\bfetch\(/);
      },
    );
  });

  describe("bootstrap composes but never executes business actions", () => {
    const bootstrapFiles = [...srcFiles.entries()].filter((entry) =>
      entry[0].startsWith("packages/api/src/bootstrap/"),
    );

    it("found bootstrap files to scan", () => {
      expect(bootstrapFiles.length).toBeGreaterThan(0);
    });

    it.each(bootstrapFiles)("%s never calls .execute(", (path, content) => {
      expect(content).not.toMatch(/\.execute\(/);
    });
  });

  describe("connector packages own no production execution", () => {
    const connectorPackages = listPackages().filter((name) =>
      name.startsWith("connector-"),
    );

    it("found at least the known connector packages", () => {
      expect(connectorPackages.length).toBeGreaterThanOrEqual(2);
    });

    for (const pkg of connectorPackages) {
      const files = [...srcFiles.entries()].filter(([path]) =>
        path.startsWith(`packages/${pkg}/src/`),
      );

      it.each(files)(
        `packages/${pkg}: %s makes no fetch() call`,
        (_path, content) => {
          expect(content).not.toMatch(/\bfetch\(/);
        },
      );
    }
  });

  describe("exactly one ExecutionSystem binding in production composition", () => {
    const path = "packages/api/src/bootstrap/createExecutionSystem.ts";
    const content = srcFiles.get(path);

    it("createExecutionSystem.ts exists and was scanned", () => {
      expect(content).toBeDefined();
    });

    it("binds ExecutionSystem to createExecutionGateway() and nothing else", () => {
      expect(content).toMatch(/return createExecutionGateway\(\)/);
      // No other execution-system-shaped factory or adapter constructed here.
      expect(content).not.toMatch(/new (Gateway|Connector|Http|HubSpot)\w*\(/);
    });
  });

  describe("package-level ownership: execution-control and execution-gateway have a closed dependent set", () => {
    // Package-level complement to the file-content checks above (Phase 1F).
    // A dependency-cruiser config exists in this repo (.dependency-cruiser.cjs)
    // but was found, while working on this phase, not to resolve @parmana/*
    // workspace-scoped imports at all for this repo's TS-project-references +
    // NodeNext setup (verified: a known real import of @parmana/execution-control
    // resolved to zero dependencies in depcruise's own JSON output) — its 5
    // pre-existing rules have likely never caught a real cross-package
    // violation. Rather than wire a silently-non-functional check into CI, this
    // extends the mechanism already proven to work in this file: a direct scan
    // of import specifiers. See docs/architecture/repository-invariants.md.
    const controlImportPattern = /from\s+["']@parmana\/execution-control["']/;
    const gatewayImportPattern = /from\s+["']@parmana\/execution-gateway["']/;

    const controlAllowed = (path: string): boolean =>
      path.startsWith("packages/execution-control/") ||
      path.startsWith("packages/execution-gateway/") ||
      path.startsWith("packages/api/");

    const gatewayAllowed = (path: string): boolean =>
      path.startsWith("packages/execution-gateway/") ||
      path.startsWith("packages/api/");

    const controlImporters = [...srcFiles.entries()]
      .filter(([, content]) => controlImportPattern.test(content))
      .map(([path]) => path);

    const gatewayImporters = [...srcFiles.entries()]
      .filter(([, content]) => gatewayImportPattern.test(content))
      .map(([path]) => path);

    it("found at least the known real @parmana/execution-control importers (sanity check the scan isn't vacuous)", () => {
      expect(controlImporters.length).toBeGreaterThan(0);
    });

    it("found at least the known real @parmana/execution-gateway importers (sanity check the scan isn't vacuous)", () => {
      expect(gatewayImporters.length).toBeGreaterThan(0);
    });

    it("only execution-control, execution-gateway, or api import @parmana/execution-control", () => {
      const unapproved = controlImporters.filter(
        (path) => !controlAllowed(path),
      );
      expect(unapproved).toEqual([]);
    });

    it("only execution-gateway or api import @parmana/execution-gateway", () => {
      const unapproved = gatewayImporters.filter(
        (path) => !gatewayAllowed(path),
      );
      expect(unapproved).toEqual([]);
    });

    it("no connector package (present or future) imports execution-control or execution-gateway", () => {
      const connectorPackages = listPackages().filter((name) =>
        name.startsWith("connector-"),
      );
      const violators = [...controlImporters, ...gatewayImporters].filter(
        (path) =>
          connectorPackages.some((pkg) => path.startsWith(`packages/${pkg}/`)),
      );
      expect(violators).toEqual([]);
    });
  });

  describe("Phase 1D public API boundary stays generically enforced (not just a hardcoded symbol list)", () => {
    // packages/execution-gateway/tests/unit/public-api-boundary.test.ts checks
    // a hardcoded list of 10 known internal symbols against the built
    // package's runtime exports — valuable, but a *new* internal class added
    // to connector-execution/ later wouldn't be covered until someone
    // remembers to add its name to that list. This derives the "must stay
    // internal" set from connector-execution/index.ts itself (minus the
    // public factory files, which are the intended public surface), so it
    // covers symbols that don't exist yet.
    const internalBarrelPath =
      "packages/execution-gateway/src/connector-execution/index.ts";
    const publicBarrelPath = "packages/execution-gateway/src/index.ts";

    /** Strips /* *\/ block comments and // line comments so prose mentioning a class name (e.g. explaining why it's NOT exported) doesn't false-positive as an export. */
    function stripComments(content: string): string {
      return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    }

    const internalBarrel = srcFiles.get(internalBarrelPath);
    const publicBarrelRaw = srcFiles.get(publicBarrelPath);
    const publicBarrel =
      publicBarrelRaw === undefined
        ? undefined
        : stripComments(publicBarrelRaw);

    const publicFactoryFiles = new Set([
      "createGatewayConnectorRegistry",
      "createGatewayHubSpotConnector",
      "createGatewayGitHubConnector",
      "createGatewayGitHubCredentialProvider",
      "createGatewayPaytmConnector",
      "createGatewaySlackConnector",
    ]);

    it("both barrel files exist and were scanned", () => {
      expect(internalBarrel).toBeDefined();
      expect(publicBarrel).toBeDefined();
    });

    const reExportedFiles = [
      ...(internalBarrel ?? "").matchAll(
        /export \* from ["']\.\/([\w-]+)\.js["']/g,
      ),
    ].map((m) => m[1]!);

    it("found files re-exported by the internal connector-execution barrel (sanity check)", () => {
      expect(reExportedFiles.length).toBeGreaterThan(0);
    });

    const implementationFiles = reExportedFiles.filter(
      (name) => !publicFactoryFiles.has(name),
    );

    it("at least one implementation file (non-factory) is present to check (sanity check)", () => {
      expect(implementationFiles.length).toBeGreaterThan(0);
    });

    for (const fileName of implementationFiles) {
      const filePath = `packages/execution-gateway/src/connector-execution/${fileName}.ts`;
      const fileContent = srcFiles.get(filePath);

      const exportedNames = [
        ...(fileContent ?? "").matchAll(
          /^export (?:class|interface|function|const|type)\s+(\w+)/gm,
        ),
      ].map((m) => m[1]!);

      it.each(exportedNames)(
        `${fileName}.ts's exported symbol %s does not leak into the public package barrel`,
        (name) => {
          expect(publicBarrel).not.toMatch(new RegExp(`\\b${name}\\b`));
        },
      );
    }
  });
});

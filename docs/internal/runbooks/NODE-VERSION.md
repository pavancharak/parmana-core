# Node version: policy, where it is set, and how to change it

Status as of 2026-11-07. Owner: the maintainer. Enforced in part by `tests/architecture/node-version-pinned.test.ts`.

## Policy

- Parmana runs on **one Node major version**, the one its tests cover. Today that is **24**.
- The version is pinned to an exact release where the repository controls it, so tests and production run the same build.
- Moving to a new major version is a planned change (section 4), never a side effect of a setting.

## Where the version is set

| Place                                                            | Setting now                           | Enforced by                                               |
| ---------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| `package.json` `engines.node`                                    | `24.x`                                | `node-version-pinned.test.ts`                             |
| CI (`.github/workflows/*.yml`, `node-version`)                   | `24.22.2`                             | `node-version-pinned.test.ts` (same major, exact release) |
| Dockerfile base images (`node:24` build, `node:24-slim` runtime) | pinned by digest; both run `v24.22.2` | `node-version-pinned.test.ts` (major)                     |
| Vercel project, Build and Deployment, Node.js Version            | **26.x (override)**                   | Not enforced. Set in the Vercel dashboard.                |

## What is verified

- Official Node **24.22.1** and **24.22.2** bundle `emSign Root CA - G1`, which is one of the four listed distrusted roots. The production Docker images run the official 24.22.2 binary, byte-identical to nodejs.org's release.
- Official Node **26.12.1** also bundles G1 (checked from the release, without running it).
- The full test suite passes on Node 24.22.1 (3,548 tests) and on Node 26.12.1 in the sandbox (3,548 tests). These are sandbox runs; they do not cover Vercel's runtime.
- The startup check (`assertListedRootIsBundled`, PR #487) refuses to start on a build that bundles none of the listed roots.

## Open: Vercel production runs 26.x

The Vercel project shows **Node.js Version 26.x**, with 24.x struck through, so the dashboard setting overrides the 24.x default. The production deployment on `main` (commit `7ead402` at the time of checking) runs on 26.x.

Until this is changed:

- The production Vercel build is not the Node version the tests and CI cover, though the suite passes on 26.12.1 in the sandbox.
- The next deploy from `main` includes the startup check, which passes on 26.12.1 but not on a future 26 patch that drops every listed root.

**To close this (owner, dashboard):** set the Node.js Version to `24.x`, remove the override, then redeploy and check `/health`. Confirm the patch from the build log's `Using Node.js` line.

## 4. Moving to a new major version

Do all of this on a branch, before changing any setting.

1. Run the full suite on the new version, with native modules rebuilt (`npm rebuild`).
2. Confirm the official release of the exact patch bundles at least one listed root (`emSign Root CA - G1`). Read the certificates from the release file; do not run an unverified binary.
3. Change all four places in section 2 in one commit: `engines.node`, the CI `node-version`, the Dockerfile digests, and the test expectations.
4. Deploy a Vercel preview on the new version. Check the build log's `Using Node.js` line and `/health`.
5. Only then change the production setting, and redeploy.

Rollback is the reverse: set the Vercel version back and redeploy the previous production deployment.

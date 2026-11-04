# ADR-0015: Compile with TypeScript 7, keep TypeScript 6 for tools

**Status:** Proposed on 2026-10-05, built on the same branch as the proposal.

**Date:** Proposed 2026-10-05.

**Relates to:** `CONTRIBUTING.md` ("TypeScript versions"), `.github/dependabot.yml` (majors of `typescript` are
upgraded by hand).

## Context

TypeScript 7 is the native compiler, rewritten in Go. It typechecks and builds this repository in about one second.
It no longer ships the JavaScript compiler API (`import ts from "typescript"`): the `typescript@7` package exports only
its version and a `tsc` binary. Microsoft publishes the TypeScript 6 API separately, as `@typescript/typescript6`.

Three things in this repository need that API:

| Needs the API                          | Why                                    | Supports TypeScript 7             |
| -------------------------------------- | -------------------------------------- | --------------------------------- |
| `typescript-eslint` 8                  | `npm run lint` parses every `.ts` file | No, peer range `>=4.8.4 <6.1.0`   |
| `typedoc` 0.28                         | SDK reference generation               | No, peer range `5.0.x` to `6.0.x` |
| `scripts/sdkdocs/checkSdkDocs.ts`      | Checks the SDK docs match the SDKs     | Uses `typescript` directly        |
| `scripts/build-book/buildReference.ts` | Generates the build book reference     | Uses `typescript` directly        |

Moving the `typescript` package itself to 7 was tried and fails at install: `typescript-eslint` and `typedoc` declare
`typescript` as a peer dependency, a hoisted package must share its peer with the root, and an npm `overrides` entry
cannot give it a different one (`npm install` and `npm ci` stop with `ERESOLVE`).

The code itself needs no change for 7: `tsc --noEmit` with 7.0.2 is clean. The one setting 7 changes that mattered
(`types` now defaults to `[]`) was handled in the move to TypeScript 6: `typescript/tsconfig.json` lists `"node"`, and
every package inherits `"types": ["node"]` from the root `tsconfig.json`.

## Decision

Run the two versions side by side, each for what it can do:

| Package                             | Version | Used for                                                                |
| ----------------------------------- | ------- | ----------------------------------------------------------------------- |
| `typescript`                        | 6.0.3   | The compiler API: `typescript-eslint`, `typedoc`, the two scripts above |
| `typescript7` (`npm:typescript@^7`) | 7.0.2   | Every build and typecheck                                               |

The `typescript7` alias is called by path, `node node_modules/typescript7/bin/tsc`, because its binary is also named
`tsc` and npm links the `typescript` one. These call TypeScript 7:

- `npm run build`, `build:verbose`, `build:force`, `clean` and `typecheck` (root `package.json`)
- `npm run build` and `typecheck` in the SDK (`typescript/package.json`)
- the build stage of the `Dockerfile`
- the Vercel build (`vercel.json`)

A bare `tsc` or `npx tsc`, and the `build` and `typecheck` scripts inside each `packages/*` workspace, still run
TypeScript 6. Both versions compile the code without errors, so either works locally; CI and deployments use 7.

## Evidence

Built every package with 6.0.3 and with 7.0.2 and compared `dist/`:

- every `.js` file is byte for byte identical;
- one `.d.ts` file (`packages/crypto/dist/ExecutionTrustRecordCanonicalView.d.ts`) lists two properties in a different
  order, which does not change the type;
- source maps and `.tsbuildinfo` differ, as expected between compilers.

With the decision in place: `npm ci` from a clean checkout, `npm run build`, `npm run lint`, `npm run typecheck`, the
SDK typecheck, the full test suite (2,890 passed) and the Dockerfile's build command all pass, and
`npm run generate:build-book-reference` produces no change.

## Consequences

- Builds and typechecks are faster. A full `tsc -b` of the monorepo takes about one second.
- Two TypeScript versions are installed. A difference between them shows up as code that typechecks under one and not
  the other; CI runs 7, so 7 is the one that must pass.
- `package-lock.json` lists the TypeScript 7 native binaries for each platform. npm installs only the one for the
  machine it runs on.
- Dependabot keeps ignoring majors of `typescript`, so neither version moves by surprise.

## Finishing the move to TypeScript 7

When `typescript-eslint` and `typedoc` both accept TypeScript 7 as a peer:

1. Set `"typescript": "^7"` in the root and every workspace `package.json`, remove the `typescript7` alias, and change
   every `node node_modules/typescript7/bin/tsc` (root `package.json`, `typescript/package.json`, `Dockerfile`,
   `vercel.json`, `docs/site/handbook/21-deployment.mdx`) back to `tsc`.
2. Change `import ts from "typescript"` in the two scripts to `import ts from "@typescript/typescript6"`, add it as a
   root devDependency, or move them to the TypeScript 7 API.
3. Run `npm install`, then the full check (`npm run preflight`) and `npm run generate:build-book-reference`, and
   confirm the reference output does not change.

To see whether the tools are ready: `npm view typescript-eslint peerDependencies` and
`npm view typedoc peerDependencies`.

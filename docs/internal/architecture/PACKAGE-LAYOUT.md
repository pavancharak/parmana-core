# Package layout: why npm has many packages and Python has one

Status: accepted as the current layout (5.0.0 release). Owner: Pavan Charak.

## Summary

- **npm (TypeScript):** one workspace package per area under `packages/*`, published as 17 `@parmana/*` packages. The connector SDK is `@parmana/connector-sdk`, inside the core repo.
- **Python:** one distribution, `parmana`, with its areas as subpackages (`api`, `crypto`, `models`, `errors`, `serialization`, `transport`, `types`, `config`). A separate distribution, `parmana-verifier`, is published from the verifier repo.
- The server is TypeScript only. The Python package is an SDK client and offline checker, not a server.

## Why npm is split

1. **Smaller installs.** A consumer who only needs to check a record can install `@parmana/crypto` or `@parmana/envelope-verifier` without the server, database, or policy engine.
2. **Smaller security surface.** Signature and record checks live in packages that do not import server code, so they are easier to review.
3. **Explicit boundaries.** `policy`, `runtime`, `storage`, `execution-*` and `connector-sdk` each state their dependencies in their own `package.json`.

Costs:

- 17 packages to publish for each release.
- Internal `@parmana/*` version references must move together (5.0.0 changed 18 `package.json` files and the lockfile).
- Packages are released in lockstep, so the split gives no independent versioning in practice.

## Why Python is one package

1. **One import path.** Users write `from parmana import ...`. Splitting would mean several distributions sharing one import namespace, which is harder to build and to install reliably.
2. **Scope.** The Python package is a client and offline checker. It has no server packages to separate.
3. **Packaging convention.** A single distribution with subpackages is the usual shape for a Python SDK.

## The exception: `parmana-verifier`

The verifier is its own distribution in both ecosystems (`@parmana/verifier` on npm, `parmana-verifier` on PyPI). A reviewer or auditor may need to check a record without installing the SDK, so the verifier must stand alone. It is maintained in its own repository, with no network access and no dependencies beyond the standard library and `cryptography`.

## Alternatives considered

- **Merge the npm server packages into one.** Fewer publishes, but users can no longer install only the verifier or only the crypto layer. Not chosen.
- **Split Python into several distributions.** More moving parts for no user-visible gain. Not chosen.

## When to revisit

- A user needs a Python server or a Python connector SDK, which would justify a second Python distribution.
- The npm release cost becomes a blocker, which would justify merging the server-side packages.

## Related

- `docs/internal/REPO-CONTENTS.md` (repository map)
- `docs/developer-portal/sdk/README.md` (what each published package is for)

# Package layout: why npm has many packages and Python has three

Status: accepted as the current layout (5.0.0 release). Owner: Pavan Charak.

## Summary

- **npm (TypeScript):** one workspace package per area under `packages/*`, published as 17 `@parmana/*` packages. The connector SDK is `@parmana/connector-sdk`, inside the core repo.
- **Python:** three distributions, each published at 5.0.0:
  - `parmana`: the SDK client, with its areas as subpackages (`api`, `crypto`, `models`, `errors`, `serialization`, `transport`, `types`, `config`). Source: `python/` in the core repo.
  - `parmana-connector-sdk`: the Python connector SDK. Source: `python-connector-sdk/` in the core repo.
  - `parmana-verifier`: the offline verifier. Source: the verifier repo.
- The server is TypeScript only. The Python packages are an SDK client, a connector SDK and an offline checker, not a server.

## Why npm is split

1. **Smaller installs.** A consumer who only needs to check a record can install `@parmana/crypto` or `@parmana/envelope-verifier` without the server, database, or policy engine.
2. **Smaller security surface.** Signature and record checks live in packages that do not import server code, so they are easier to review.
3. **Explicit boundaries.** `policy`, `runtime`, `storage`, `execution-*` and `connector-sdk` each state their dependencies in their own `package.json`.

Costs:

- 17 packages to publish for each release.
- Internal `@parmana/*` version references must move together (5.0.0 changed 18 `package.json` files and the lockfile).
- Packages are released in lockstep, so the split gives no independent versioning in practice.

## Why the main Python SDK is one package

1. **One import path.** Users write `from parmana import ...`. Splitting `parmana` would mean several distributions sharing one import namespace, which is harder to build and to install reliably.
2. **Scope.** The SDK is a client. It has no server packages to separate.
3. **Packaging convention.** A single distribution with subpackages is the usual shape for a Python SDK.

## The exceptions: `parmana-connector-sdk` and `parmana-verifier`

- **`parmana-connector-sdk`** is a separate distribution with its own import name (`parmana_connector_sdk`). Connector authors install it without the client SDK, and its version is tracked with the release manifest. It was published to PyPI at 5.0.0 on 2026-11-21.
- **`parmana-verifier`** is a separate distribution in both ecosystems (`@parmana/verifier` on npm, `parmana-verifier` on PyPI). A reviewer or auditor may need to check a record without installing the SDK, so the verifier must stand alone. It is maintained in its own repository, with no network access and no dependencies beyond the standard library and `cryptography`.

## Alternatives considered

- **Merge the npm server packages into one.** Fewer publishes, but users can no longer install only the verifier or only the crypto layer. Not chosen.
- **Split the main Python SDK into several distributions.** More moving parts for no user-visible gain. Not chosen.

## When to revisit

- A user needs a Python server, which would justify a further Python distribution.
- The npm release cost becomes a blocker, which would justify merging the server-side packages.

## Related

- `docs/internal/REPO-CONTENTS.md` (repository map)
- `docs/developer-portal/sdk/README.md` (what each published package is for)

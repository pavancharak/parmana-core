# Changelog

[Portal home](README.md) · [Coverage report](COVERAGE.md)

This changelog records changes to the developer portal in `docs/developer-portal/`. It does not record changes to the Parmana software. For those, see the repository's release notes and the packages' own changelogs (for example `parmana-verifier`'s `CHANGELOG.md`).

Versions follow the packages the portal documents: SDKs and server 4.1.1, offline verifier 2.0.3.

## 2026-11-20: first version of the developer portal

Added the developer portal in `docs/developer-portal/`, written from the repository's source and checked against it:

- **Portal structure:** overview, getting started, architecture, SDKs, REST API, tutorials, policy management, deployment, security, troubleshooting, reference, FAQ, glossary, examples, and this changelog.
- **SDK references:** `@parmana/sdk` (58 methods) and `parmana` (50 methods), each with a generated method index that gives every signature and the HTTP request each method sends. Also the offline verifier (`@parmana/verifier`, `parmana-verifier`), the operator CLI (`@parmana/cli`), and the connector SDK's contract.
- **REST API:** authentication, headers, errors, status codes, and the core endpoints with `curl`, JavaScript and sample responses. A generated index lists all 66 OpenAPI operations.
- **Tutorials:** Node.js, Python, fintech, refund authorization, maker-checker, transaction limits, AI agents, and evidence verification.
- **Security:** what is signed, canonical JSON and hashing, trust roots, schema versions and their coverage, tamper results, fail-closed behaviour, key management, and a production checklist.
- **Runnable examples:** a governed quickstart kit (setup script, TypeScript and Python flows, approval and limit cases, a REST smoke test, and a standalone verification script). Each was run against a local server for this release.
- **Tools:** `tools/generate-indexes.mjs` regenerates the method, endpoint and error-code indexes from source. `tools/check-docs.mjs` checks links and anchors, reports public methods and operations not named in narrative pages, and flags removed claims.
- **Coverage report:** [COVERAGE.md](COVERAGE.md), with the verification log, sixteen known issues found during this review, and the remaining gaps.

Documented findings that need an owner decision (none were changed in the repository):

- The existing quickstart does not run as written.
- The server reports version `0.4.0` while the packages are `4.1.1`.
- The installed `parmana-ops` binary prints nothing.
- Schema version 2 records leave most fields outside the signature. Schema version 3 is opt-in.
- A stale comment in the configuration describes schema version 3 as unreadable by the SDKs. Those SDKs read it correctly.
- The TypeScript workspace's `npm test` fails: six test files are empty.

Not changed: the server, the packages, the existing documentation site (`docs/site/`), the existing guides, the tests and the examples. The portal is not published, and the proposed navigation for the documentation site is not applied.

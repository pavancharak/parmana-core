# ADR-0023: One Verifier and One CLI

**Status:** Accepted (owner decision, 2026-11-27). The npm deprecation of `@parmanasystems/verifier-cli` is not yet done; see "Still open".

**Date:** Proposed and accepted 2026-11-27.

**Relates to:** `docs/site/verification/offline-verifier.mdx`, `docs/site/cli/reference.mdx`, ADR-0018 (connectors outside core).

## Context

Two npm packages present themselves as verification tools:

- `@parmana/verifier`, command `parmana-verify`. An offline checker for Execution Trust Records and Policy version 2 evidence chains. It has no dependencies and makes no network calls.
- `@parmanasystems/verifier-cli`, command `parmana`. A broader governance CLI with `verify`, `runtime`, `provenance`, `policy` and `workspace` commands. It depends on `@parmanasystems/core`, which is not part of this repository.

The core CLI, `@parmana/cli` with command `parmana-ops`, has an approval-log check (`log verify`) and the maker-checker policy commands. The name `parmana` and overlapping descriptions have caused confusion in the documentation.

The owner has confirmed that `@parmanasystems/verifier-cli` has no existing users.

## Decision

1. **`@parmana/verifier` is the only offline verifier for Execution Trust Records,** and the documentation points to it. Its `policy-v2` command checks Policy version 2 evidence chains.
2. **`parmana-ops` is the only CLI for online governance and for the approval log.** `parmana-ops log verify` checks the approval log's chain, signatures and policy coverage. It does not check Execution Trust Records.
3. **`@parmanasystems/verifier-cli` is retired, not merged.** Its `runtime`, `provenance` and `workspace` commands are not carried forward. Release provenance is checked with `slsa-verifier`, as documented in `docs/site/security/overview.mdx`.

## Consequences

- The `parmana` command name is no longer recommended by Parmana's documentation. Scripts should use `parmana-verify` or `parmana-ops`.
- The offline verifier stays free of dependencies, because it is not combined with governance code.
- Any future governance command is added to `parmana-ops`, not to a second CLI.

## Still open

- The npm deprecation notice on `@parmanasystems/verifier-cli` is not yet published. Its wording is in the owner's review.
- The generated CLI reference describes `log verify` as "the approval log's chain"; it does not state that trust records are checked elsewhere. The offline verifier page now says so.

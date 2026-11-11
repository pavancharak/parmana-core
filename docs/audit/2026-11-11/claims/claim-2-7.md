# 2.7 Replay Support

Source: CLAIMS.md (commit d1d63c6), lines 211-224.

## Exact claim text

## 2.7 Replay Support

Parmana supports replay of recorded execution decisions for verification and analysis, via the standalone `@parmana/replay` package (`ReplayEngine`), which re-evaluates a recorded policy decision against its recorded signals and reports whether the outcome matches.

**Scope note (independently verified, Phase 2G):** this is a package-level capability, not yet wired into the HTTP API. `POST /replay` exists and returns 200, but its actual implementation (`ExecutionTrustApplication.replay()`) performs a signature/hash recheck of the stored Trust Record — the same category of check as `/verify` — not a call into `@parmana/replay`. Both behaviors are real and tested; they are simply two different things sharing the word "replay." See `docs/site/replay/overview.mdx` for the full disambiguation and the Phase 2G replay semantics record (in git history) for the independent verification, call graphs, and regression tests establishing this as the current, intentional, and separately production-contracted (both SDKs are typed against `POST /replay`'s current response shape) behavior — not an unwired bug awaiting a fix.

Evidence

- Replay package (packages/replay/src/ReplayEngine.ts)

- the Phase 2G replay semantics record (in git history)

---


## Cited evidence paths

- `docs/site/replay/overview.mdx`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.

# Production Readiness Gate

Engine, policy and owner records for the gate described in
[docs/PRODUCTION_READINESS.md](../docs/PRODUCTION_READINESS.md).

- `policies/readiness-policy.json` is the set of checks and gates.
- `scripts/evaluate-gates.py` runs them. It uses only the Python standard library.
- `evidence/manual/` holds the owner records for G8.
- `tests/` holds the engine's unit tests.
- The workflow is `.github/workflows/production-readiness.yml`.

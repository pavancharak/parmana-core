# Survivor classifications

One file per package: `<package>.md`. Each survivor in `reports/mutation/<package>.json` needs one row:

```
| id | class | rationale |
| --- | --- | --- |
| `packages/crypto/src/X.ts:12:EqualityOperator` | equivalent | same result for every input because ... |
```

- **id**: `file:line:mutator`. A second survivor on the same line and mutator is `#2`, and so on.
- **class**: `missing test`, `insufficient assertion`, `equivalent`, `unreachable` or `out of scope`.
- **rationale**: one sentence that a reviewer can check.

Check a package with `npx tsx scripts/check-survivor-classification.ts <package>`. Add `--strict` to fail on unclassified or stale rows. The strict mode is not yet wired into CI; see EXECUTION_PLAN.md section 9.

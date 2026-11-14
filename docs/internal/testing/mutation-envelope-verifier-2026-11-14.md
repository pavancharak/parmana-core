# Mutation testing: envelope-verifier

Run date: 14 November 2026. Command: `npm run mutation -- envelope-verifier`, Node 24.22.1.
Base: `origin/main` at `72de667`, plus the content-based dist-stamp fix applied locally in the sandbox
only. The fix is not on `main` and not pushed. Without it, the run stops at the dist-freshness check.

## Result

**Mutation score: 90.8%.** 118 of 130 mutants caught, 12 survived, 0 timed out, 0 no coverage, 0 errors.
Initial (unmutated) test run passed: 1 test ran in about 2 seconds.

| File                  | Score  | Killed | Survived |
| --------------------- | ------ | ------ | -------- |
| `EnvelopeVerifier.ts` | 86.96% | 80     | 12       |
| `express.ts`          | 100%   | 16     | 0        |
| `MemoryNonceStore.ts` | 100%   | 22     | 0        |

Runtime: 1 minute 30 seconds. Average tests per mutant: 1.00.

## The 12 survivors

All in `packages/envelope-verifier/src/EnvelopeVerifier.ts`.

| Line | Mutant                                  | What it changes                                                                                   |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 175  | BlockStatement                          | Removes a block; nothing fails                                                                    |
| 214  | BooleanLiteral                          | Flips a boolean literal                                                                           |
| 216  | BooleanLiteral                          | Flips a boolean literal                                                                           |
| 233  | EqualityOperator                        | Changes an equality comparison                                                                    |
| 236  | ConditionalExpression, LogicalOperator  | Replaces a condition; changes `&&` to `\|\|`                                                      |
| 237  | ConditionalExpression, EqualityOperator | Replaces a condition; changes an equality                                                         |
| 243  | ConditionalExpression, LogicalOperator  | Replaces `keyValid !== false && versionSupported` with `keyValid !== false \|\| versionSupported` |
| 250  | ConditionalExpression                   | Replaces the `keyValid` spread condition with `false`                                             |

Most survivors sit in one block: the key-validity and version checks around lines 233 to 250. A test
that sends an envelope with a key that is valid but has an unsupported version, and one with an
invalid key, would likely catch them. Each suggested test should be checked by hand against its mutant,
as was done for the crypto batches.

## What this does not show

- It does not show that the 118 caught mutants are caught by the right tests. Only that some test fails.
- Equivalent mutants (changes that alter no behaviour) are counted as survivors. Some of the 12 may be
  equivalent; each needs a manual check before it is written off.
- The score is for this commit. A later change to `EnvelopeVerifier.ts` needs a fresh run.

## Next steps

1. Write tests for the key-validity and version checks, one per survivor group.
2. Re-run `npm run mutation -- envelope-verifier` and record the new score.
3. Push the dist-stamp fix so every package can be run on `main`.

## Update: 14 November 2026, after new key-validity tests

Command: `npm run mutation -- envelope-verifier`, Node 24.22.1. Base: `origin/main` at `72de667`, with the
content-based dist-stamp fix applied locally in the sandbox only, plus the new test file below.
Exit code 0.

**Mutation score: 91.5%.** 119 of 130 mutants caught, 11 survived (first run: 118 of 130, 12 survived).

### What changed

- Added `packages/envelope-verifier/tests/unit/key-validity-reporting.test.ts`, with three tests:
  1. Without a key provider, `keyValid` is absent from `checks`, not present with an undefined value.
  2. With a key provider, a resolvable key reports `keyValid: true`.
  3. With a key provider, an unknown key reports `keyValid: false` and fails the envelope.
- All three pass (`npx vitest run ...`, 3 of 3).
- The spread mutant on line 250 is now caught. Earlier survivors on lines 233 and 236 to 243 remain.

### Survivors still open (11)

| Line | Mutant                                       | Notes                                                                                 |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------- |
| 175  | BlockStatement                               | Not yet examined                                                                      |
| 214  | BooleanLiteral                               | Not yet examined                                                                      |
| 216  | BooleanLiteral                               | Not yet examined                                                                      |
| 233  | EqualityOperator                             | `this.keyProvider === undefined`. Not explained by the new tests; needs investigation |
| 236  | ConditionalExpression (x2)                   | Coupled to the signature checks. May be equivalent                                    |
| 237  | ConditionalExpression, EqualityOperator (x2) | As above                                                                              |
| 243  | ConditionalExpression, LogicalOperator (x3)  | `keyValid` false implies `signatureVerified` false. Likely equivalent                 |

### Status of the test file

The test file is on the sandbox branch `envelope-tests`, not pushed. The commit and push for
`claude/envelope-verifier-tests` are pending on the owner's machine.

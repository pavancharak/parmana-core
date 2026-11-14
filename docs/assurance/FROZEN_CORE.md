# Frozen cryptographic core: rule and procedure

**Status:** In force since 14 November 2026 (decision D8, confirmed by the owner).
**Owner:** Pavan Charak.
**Enforced by:** `tests/assurance/frozen-core.test.ts`, against `docs/assurance/frozen-core.manifest.json`.
**File list:** [COVERAGE_REGISTER.md](COVERAGE_REGISTER.md), section 3.

## The rule

The files in the frozen list may change only after the owner has reviewed the change. A change to one of them fails the build until the manifest is regenerated, and the regenerated manifest is then part of the diff for review.

The frozen set is:

- Individual files: `ArtifactSigner.ts`, `TrustRecordHasher.ts`, `CanonicalSerializer.ts`, `ExecutionTrustRecordCanonicalView.ts`, `OfflineVerifier.ts`.
- Every `.ts` file in `packages/crypto/src/providers/signature/` and `packages/crypto/src/providers/hash/`.

`ExecutionCorrespondenceOffline.ts` is not frozen. It is new and additive.

## What the test checks

1. The manifest exists.
2. Every recorded file exists and its SHA-256 matches.
3. The manifest lists exactly the current frozen set. A file added to a frozen directory without being listed fails. So does a listed file that is no longer part of the set.
4. Each named file exists.

## Procedure for an intended change

1. Make the change on a `claude/` branch.
2. Run `npm run build:packages`, then run the test. It should fail and name the changed file.
3. Get the owner's review. CODEOWNERS requires it for `packages/crypto/`, the manifest and the test.
4. After approval, regenerate the manifest:

   ```
   ASSURANCE_WRITE_FROZEN_MANIFEST=1 node_modules/vitest/vitest.mjs run tests/assurance/frozen-core.test.ts
   ```

5. Run the test again. It should pass.
6. Commit the source change and the manifest together, so the review shows both.
7. If the change needs new test vectors, add them in the same change.

Do not regenerate the manifest to get a passing build without a review. A regenerated manifest that nobody reviewed defeats the rule.

## Limits

- The test reads the files on disk. It cannot stop a change made by someone who also edits the manifest. CODEOWNERS is what makes that change visible and needs an approval. Branch protection must require that review for it to be enforced.
- The repository's dist-freshness guard also stops a run when a source file changes after the last build. That guard is separate. It means the frozen test only runs after a rebuild.
- The test checks that the files have not changed. It does not check that they are correct. Correctness is covered by the vectors and the benchmark.
- The list is confirmed for the current files. A new cryptographic file outside the two directories is not frozen until it is added to the list and the manifest.

## Probe

On commit `5b7d2c3c` a temporary change to `ArtifactSigner.ts` made the test fail, and it named the file. Restoring the file made it pass again. See the results log entry of 14 November 2026.

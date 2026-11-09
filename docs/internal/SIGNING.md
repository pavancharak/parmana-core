# Commit signing

`main` requires signed commits. This note records how signing works here, the known exception, and the steps that
turn enforcement on.

## Setting up signing on your machine

Use a GPG key that GitHub knows (add the public key under GitHub Settings → SSH and GPG keys). Then, in each clone:

```bash
git config user.signingkey <your-GPG-key-ID>
git config commit.gpgsign true
```

New commits are signed automatically. To sign a commit that already exists, amend it with `git commit --amend --no-edit -S`
and push the branch with `git push --force-with-lease`. Only do that on a branch no one else has built on.

## Known exception: unsigned merges

These merges went into `main` without a signature. Their history is not rewritten, because rewriting merged history breaks
every clone and open pull request.

- PRs #526 to #536, merged 2026-11-09. Recorded in `docs/internal/handovers/G-143-sandbox-2026-11.md` and
  `docs/internal/designs/TEST-DATABASE-CONFIG.md`, section 9.

## Enforcement

1. Check the `main` branch protection rule: "Require signed commits" should be on, and admin bypass should be off. If the
   unsigned merges went through, something in that rule is not enforced.
2. The `Commit signatures` workflow (`.github/workflows/commit-signatures.yml`) fails a pull request that contains any
   commit GitHub does not verify. Add it as a required status check on `main` once every open pull request is signed.

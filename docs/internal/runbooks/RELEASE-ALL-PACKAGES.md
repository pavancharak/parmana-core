# Runbook: releasing every Parmana package

This runbook covers a release of the four SDK packages in this repository and the two verifier packages in `pavancharak/parmana-verifier`. Each release uses one version number per repository. The 1.6.2 release is the worked example, and its values are shown in the commands below.

| Package                  | Registry | Repository                                 | Tag                   |
| ------------------------ | -------- | ------------------------------------------ | --------------------- |
| `@parmana/sdk`           | npm      | `parmana-core` (`typescript/`)             | `sdk-v<version>`      |
| `parmana`                | PyPI     | `parmana-core` (`python/`)                 | `sdk-v<version>`      |
| `@parmana/connector-sdk` | npm      | `parmana-core` (`packages/connector-sdk/`) | `sdk-v<version>`      |
| `@parmana/shared`        | npm      | `parmana-core` (`packages/shared/`)        | `sdk-v<version>`      |
| `@parmana/crypto`        | npm      | `parmana-core` (`packages/crypto/`)        | `sdk-v<version>`      |
| `@parmana/cli`           | npm      | `parmana-core` (`packages/cli/`)           | `sdk-v<version>`      |
| `parmana-connector-sdk`  | PyPI     | `parmana-core` (`python-connector-sdk/`)   | `sdk-v<version>`      |
| `@parmana/verifier`      | npm      | `parmana-verifier`                         | `verifier-v<version>` |
| `parmana-verifier`       | PyPI     | `parmana-verifier` (`python/`)             | `verifier-v<version>` |

The per-package release notes are `typescript/RELEASING.md`, `python/RELEASING.md` and `RELEASING.md` in the verifier repository. This runbook ties them together and records what went wrong on the last release.

## 0. Exact steps (follow in order)

Use the sections below for detail. This list is the order. Do not skip a check, and do not start a step until the one before it has passed. Replace `X.Y.Z` with the new version, for example `4.1.1`.

**Before you start**

1. Read the release notes of the last release, so you know what changed.
2. On the machine that publishes, confirm the tools: `node --version` shows 24.x, `npm whoami` shows the owner account, and `python -m twine --version` works.

**The version bump (section 1)**

3. From an up-to-date `main`, create `claude/release-X-Y-Z`.
4. Change the version as section 1 says, run `npm install --package-lock-only --ignore-scripts`, add the changelog entry, and run `npm run generate:llms-txt`.
5. Run `npm run build:packages` and `npx vitest run tests/architecture`. Both must pass.
6. Commit with a sign-off. Push the branch and open the bump PR only when the owner asks. Merge it to `main`.

**Build locally (section 2)**

7. From an up-to-date `main`, run `npm run build:packages`. Then build the packages with the commands in section 2. Both use this timestamp, which is the version bump's commit time and does not change with later commits on `main`:

   ```bash
   export SOURCE_DATE_EPOCH="$(git log -1 --format=%ct -- .github/release/release-manifest.json)"
   ```

   Keep the folder. Record the SHA-256 of each file (`Get-FileHash` on Windows).

**Create the release (section 3)**

8. Create the GitHub release: tag `sdk-vX.Y.Z`, target `main`, title `Parmana X.Y.Z`, with the description from section 3. Release artifacts and CLI image will fail at this point. That is expected: they install the packages from npm, which is not published yet. Do not re-run them until step 10 is done.

**Publish npm, from the step 7 files (section 5)**

9. Check the npm files' SHA-256 against the step 7 record. Publish `@parmana/shared`, then `@parmana/crypto`, then `@parmana/cli`, then `@parmana/connector-sdk`, then `@parmana/sdk`. For each one: `npm publish <file>.tgz --access public`, then `npm view @parmana/<name>@X.Y.Z version`. If `npm view` prints nothing, wait a few minutes and check again. Do not publish the same package again.
10. If npm says `409 Cannot publish over previously staged version`, run `npm stage list` and `npm view` first. Never retry blindly.

**Confirm the release files (section 4)**

11. Re-run **Release artifacts** and **CLI image** from their run pages (Re-run failed jobs). Both must be green.
12. Download the nine package files and `multiple.intoto.jsonl` from the release into one new, empty folder. Check each release file's SHA-256 against the step 7 record. The release files must match the step 7 files exactly. If any differ, stop and report it. npm already has the step 7 files, so the release is then the one that is wrong.
13. Run `slsa-verifier verify-artifact` on each `.tgz` and each Python file, with `--source-uri github.com/pavancharak/parmana-core --source-tag sdk-vX.Y.Z`. Each must print `PASSED`.

**Publish PyPI, from the release files (section 5)**

14. `python -m twine upload parmana-X.Y.Z-py3-none-any.whl parmana-X.Y.Z.tar.gz`, then `python -m twine upload parmana_connector_sdk-X.Y.Z-py3-none-any.whl parmana_connector_sdk-X.Y.Z.tar.gz`. Paste the API token at the prompt, never in chat.

**Confirm (section 6)**

15. Run `python -I .github/release/check-registry-matches-release.py X.Y.Z` from the repository. It must end with `All 9 registry files match`. If any line says `DIFFERS`, `NOT IN PROVENANCE` or `NOT ON REGISTRY`, stop and report it. The release is not complete.

**Docs (section 7)**

16. On a new branch from `main`, run `npm run record:published-sdk -- --typescript X.Y.Z --python X.Y.Z`, then update the version statements listed in section 7 and run `npm run generate:llms-txt`. Commit with a sign-off. Push and open the PR only when the owner asks.

**Never**

- Publish npm files that differ from the step 7 record. Check them in step 9 before you publish.
- Publish PyPI files from anything other than the release files checked in steps 12 and 13.
- Publish or re-publish a version that steps 12, 13 or 15 has not confirmed, unless the owner decides it.
- Re-run **Release artifacts** or **CLI image** before the npm packages are published. They fail until then.
- Use `--no-verify` on a commit or a push. If a hook fails, fix the cause (gitleaks on `PATH`, a running test database).
- Push to `main` directly, or push to a branch that isn't your own `claude/` branch.

**Environment for the commit and push hooks**

- The pre-commit hook needs `gitleaks` on `PATH`.
- The pre-push hook runs the database-backed tests. It needs the test database from `.env.test.example`, running on port 54329 (or the setup script in this environment, which starts it each session).

## 1. Prepare the version bump

Use the same version for every package in a repository.

In `parmana-core`, change:

- `typescript/package.json` (`version`), and the `@parmana/sdk` entry in the root `package-lock.json`;
- `python/pyproject.toml` (`version`), and the `SDK v…` line in `python/examples/quickstart/README.md`;
- `packages/connector-sdk/package.json` (`version`), and the `@parmana/connector-sdk` entry in the root lock file;
- `python-connector-sdk/pyproject.toml` (`version`), and `python-connector-sdk/parmana_connector_sdk/version.py` (`__version__`). The second file is easy to miss: it is hardcoded.
- Every `"@parmana/connector-sdk": "<old>"` pin in the workspace packages. Pins left at the old version make npm install the registry copy instead of the local package.

Then run `npm install --package-lock-only --ignore-scripts` so the lock file matches.

Add a changelog entry to `docs/site/changelog.mdx`. Then run `npm run generate:llms-txt`, because `llms-full.txt` is generated from the docs pages.

In `parmana-verifier`, change `package.json`, `python/pyproject.toml` and `python/parmana_verifier/__init__.py` together, and add a `CHANGELOG.md` entry.

Open a pull request for the bump. Merge it to `main` before you create the release.

## 2. Check the release candidate

Run the full test suite from the repository root. In `parmana-core`, that is `npm run check`. In `parmana-verifier`, run `npm test` and the Python tests (`PYTHONPATH=python python -m pytest python/tests`).

Pack the npm packages and build the Python packages, then run `twine check`. The npm tarball must contain only the files listed in its `files` field.

To pack the npm packages the way the release workflow does, set `SOURCE_DATE_EPOCH` to the commit time and normalize each tarball. The normalizer writes the same bytes for the same source, with the command files (the `bin` entries in `package.json`) executable:

```bash
export SOURCE_DATE_EPOCH="$(git log -1 --format=%ct -- .github/release/release-manifest.json)"
npm pack --workspace=typescript --workspace=packages/connector-sdk --workspace=packages/shared --workspace=packages/crypto --workspace=packages/cli --pack-destination /tmp/parmana-npm
for tgz in /tmp/parmana-npm/*.tgz; do python .github/release/normalize_sdist.py "$tgz"; done
```

## 3. Create the GitHub release

On GitHub, open **Releases → Draft a new release**. Create the tag (`sdk-v<version>` or `verifier-v<version>`) on `main`, and publish the release.

Publishing the release runs the **Release artifacts** workflow. It builds the packages, writes SBOMs for the npm packages, attaches the files to the release, and then attaches SLSA provenance (`multiple.intoto.jsonl`). Check that the run is green, and that the release has all of its files:

- `parmana-core`: seventeen files (nine packages, seven SBOMs, provenance).
- `parmana-verifier`: five files (the npm tarball, its SBOM, the wheel, the source distribution, provenance). The Python package has no SBOM yet.

A release cannot be created from a session without GitHub write access to releases. If you can't use the browser, ask someone with access to publish the release.

## 4. Verify the release files

Download the release files into an empty folder. Compare each file's SHA-256 with the subject list in the provenance. Then check the signature with `slsa-verifier`, which needs the source repository and the tag:

```powershell
slsa-verifier.exe verify-artifact <file> --provenance-path multiple.intoto.jsonl --source-uri github.com/pavancharak/parmana-core --source-tag sdk-v<version>
```

For `parmana-verifier`, use `--source-uri github.com/pavancharak/parmana-verifier` and the `verifier-v<version>` tag. Each file must end with `PASSED: SLSA verification passed`.

On Windows, `slsa-verifier` has to be the `windows-amd64.exe` file from its latest release. The Linux build will not run.

## 5. Publish to npm and PyPI

Publishing is manual. Publish the release's own files, not a local build, so that the registry copy is the file the provenance covers.

```powershell
npm login
npm publish <package>-<version>.tgz --access public
```

Add `--otp <code>` if the account asks for a one-time code. Publish `@parmana/sdk` and `@parmana/connector-sdk` this way. The release's `.tgz` file name is the one to publish.

Upload the Python files downloaded from the GitHub release in step 4, after their SHA-256 matches the provenance. Do not upload a local build. The release workflow builds the Python packages reproducibly (fixed timestamp, pinned build tools, normalized sdist), so the release files are the files a rebuild of the tag produces. A local build is not guaranteed to match them.

```powershell
python -m twine upload <wheel> <sdist>
```

Twine asks for a PyPI API token. Paste it at the prompt. Do not put a token in chat or in a file.

### What went wrong on 1.6.2

- **npm returned `409 Conflict: Cannot publish over previously staged version`** on the first attempt for `@parmana/connector-sdk`. `npm stage list` showed nothing staged, and a second `npm publish` returned `You cannot publish over the previously published versions`. The version was live; the registry just took minutes to show it. Check with `npm view <package> version` before you retry, and do not change the version number to work around a 409.
- **The registry lags.** `npm view` and the PyPI JSON API can show the old version for several minutes after a successful upload. Check again before you assume a failure.
- **The first npm login consumed a command.** Paste the publish command on its own line after `npm login` finishes.

## 6. Confirm the registries

```powershell
npm view @parmana/sdk version
npm view @parmana/connector-sdk version
npm view @parmana/verifier version
python -c "import urllib.request,json; print(json.load(urllib.request.urlopen('https://pypi.org/pypi/parmana/json'))['info']['version'])"
```

Each should print the new version. For each registry file, compare the npm `dist.shasum` (SHA-1) or the PyPI `sha256` digest with the release file. They must match.

**The release is not complete until the registry check passes.** Run the **Registry check** workflow from the Actions tab with the version, or run it locally:

```bash
python -I .github/release/check-registry-matches-release.py <version>
```

It downloads every file the npm and PyPI registries serve for the version, and compares its SHA-256 with the release provenance. It must end with `All ... registry files match`. If any line says `DIFFERS`, `NOT IN PROVENANCE` or `NOT ON REGISTRY`, stop and report it; do not announce the release.

## 7. Update the docs

Change the published-version statements, and nothing else that is historical:

- `docs/site/sdks/typescript.mdx`, `docs/site/sdks/python.mdx`: the current version line.
- `docs/site/choose-your-path.mdx`, `docs/site/build-book/overview.mdx`: the version table and the published date.
- `docs/site/verification/offline-verifier.mdx`: the verifier version line.
- `docs/site/security/overview.mdx`: the `slsa-verifier` example and the file list.
- `docs/internal/project/CURRENT-STATE.md`, `docs/internal/REMAINING-WORK.md`: the current release status.
- `README.md` (the Packages section) and `parmana-verifier/README.md` (the Published versions line).

Do not rewrite these historical records: `docs/internal/CLAIMS.md`, older changelog entries, and older dated sections of `REMAINING-WORK.md`. If a historical statement needs correcting, add a dated update line.

Regenerate `llms-full.txt` with `npm run generate:llms-txt` after any docs change, because a test checks that it is current. Run Prettier on the changed files first, then the generator.

Open a pull request for the docs update and merge it.

## Known gaps

- **`@parmana/*` 4.1.0 on npm.** The five npm packages were built from the commit of PR #722, and the release files from the later commit of PR #723. Their contents and modes are identical, but the timestamps differ, so the registry check reports them as `DIFFERS`. The npm copies cannot be replaced. The timestamp rule in section 0, step 7 prevents this from recurring.
- **4.0.0 and 4.0.1 on PyPI.** The `parmana` and `parmana-connector-sdk` files for these two versions were built on a local machine, before the release build was made reproducible. Their SHA-256 values differ from the Python files attached to the `sdk-v4.0.0` and `sdk-v4.0.1` releases, so the release provenance does not cover the PyPI copies. The npm packages match. Those PyPI files cannot be replaced, because PyPI does not allow a version to be re-uploaded. The first release built with the reproducible build is the next one.
- **`@parmana/cli` 4.0.2 on npm.** The npm file differs from the `sdk-v4.0.2` release file only in the file mode of `dist/index.js` (`0755` on npm, `0644` in the release). Contents and timestamps are identical. The npm copy cannot be replaced. Releases from the reproducible npm packing (this change) write the same mode in both places.
- The Python verifier has no SBOM in its release. The SDK's Python SBOM script lives in `parmana-core` and has not been copied to the verifier repository.
- `parmana-api` (the server image) is published to GHCR as `ghcr.io/pavancharak/parmana-api`. Check that it is Public after each server release. An anonymous pull of its manifest confirms it: the token request and the manifest request should both return 200.
- Some older sections still describe earlier versions. They are historical and are kept on purpose.
- In Windows PowerShell, `git` and `npm` outputs can be mistaken for failures. Check the exit state or the registry, not just the colour of the output.

## Publishing the command-line tool chain

`@parmana/cli` depends on `@parmana/crypto`, which depends on `@parmana/shared`. npm must already hold each dependency before the package that uses it can install, so publish in this order and check each step before the next:

1. `@parmana/shared` 2.0.0: `npm publish --workspace=packages/shared --access public`
2. Confirm it is visible: `npm view @parmana/shared@2.0.0 version`
3. `@parmana/crypto` 2.0.0: `npm publish --workspace=packages/crypto --access public`
4. Confirm it is visible: `npm view @parmana/crypto@2.0.0 version`
5. `@parmana/cli` 2.0.0: `npm publish --workspace=packages/cli --access public`

The release-artifacts workflow generates each package's SBOM by installing its dependencies from npm. Run it after step 5, not before, or the SBOM step fails for the packages whose dependencies are not yet published.

Publishing is manual. Run each command from an account that owns the `@parmana` scope, and only after the release has been approved.

## Standing rule: every release lists every SDK

Every release publishes every package listed in `.github/release/release-manifest.json`, at the manifest's version. The release notes must name every one of them, with its version, even if only one package changed.

To add a package to a release:

1. Add its name to `.github/release/release-manifest.json`.
2. Add its workspace to the pack step in `.github/workflows/release.yml`.
3. Add a row for it to the package table at the top of this runbook.
4. Set its version to the manifest's version.

`tests/architecture/release-manifest.test.ts` fails if any of these four steps is missing, or if a package is at a different version from the rest. The test runs in the normal test suite, so it is checked on every pull request.

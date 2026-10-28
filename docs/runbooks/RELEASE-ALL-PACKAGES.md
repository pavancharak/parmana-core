# Runbook: releasing every Parmana package

This runbook covers a release of the four SDK packages in this repository and the two verifier packages in `pavancharak/parmana-verifier`. Each release uses one version number per repository. The 1.6.2 release is the worked example, and its values are shown in the commands below.

| Package                  | Registry | Repository                                 | Tag                   |
| ------------------------ | -------- | ------------------------------------------ | --------------------- |
| `@parmana/sdk`           | npm      | `parmana-core` (`typescript/`)             | `sdk-v<version>`      |
| `parmana`                | PyPI     | `parmana-core` (`python/`)                 | `sdk-v<version>`      |
| `@parmana/connector-sdk` | npm      | `parmana-core` (`packages/connector-sdk/`) | `sdk-v<version>`      |
| `parmana-connector-sdk`  | PyPI     | `parmana-core` (`python-connector-sdk/`)   | `sdk-v<version>`      |
| `@parmana/verifier`      | npm      | `parmana-verifier`                         | `verifier-v<version>` |
| `parmana-verifier`       | PyPI     | `parmana-verifier` (`python/`)             | `verifier-v<version>` |

The per-package release notes are `typescript/RELEASING.md`, `python/RELEASING.md` and `RELEASING.md` in the verifier repository. This runbook ties them together and records what went wrong on the last release.

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

## 3. Create the GitHub release

On GitHub, open **Releases → Draft a new release**. Create the tag (`sdk-v<version>` or `verifier-v<version>`) on `main`, and publish the release.

Publishing the release runs the **Release artifacts** workflow. It builds the packages, writes SBOMs for the npm packages, attaches the files to the release, and then attaches SLSA provenance (`multiple.intoto.jsonl`). Check that the run is green, and that the release has all of its files:

- `parmana-core`: eleven files (six packages, four SBOMs, provenance).
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

## 7. Update the docs

Change the published-version statements, and nothing else that is historical:

- `docs/site/sdks/typescript.mdx`, `docs/site/sdks/python.mdx`: the current version line.
- `docs/site/choose-your-path.mdx`, `docs/site/build-book/overview.mdx`: the version table and the published date.
- `docs/site/verification/offline-verifier.mdx`: the verifier version line.
- `docs/site/security/overview.mdx`: the `slsa-verifier` example and the file list.
- `docs/CURRENT-STATE.md`, `docs/REMAINING-WORK.md`: the current release status.
- `README.md` (the Packages section) and `parmana-verifier/README.md` (the Published versions line).

Do not rewrite these historical records: `docs/CLAIMS.md`, older changelog entries, and older dated sections of `REMAINING-WORK.md`. If a historical statement needs correcting, add a dated update line.

Regenerate `llms-full.txt` with `npm run generate:llms-txt` after any docs change, because a test checks that it is current. Run Prettier on the changed files first, then the generator.

Open a pull request for the docs update and merge it.

## Known gaps

- The Python verifier has no SBOM in its release. The SDK's Python SBOM script lives in `parmana-core` and has not been copied to the verifier repository.
- `parmana-api` (the server image) is published to GHCR as `ghcr.io/pavancharak/parmana-api`. Check that it is Public after each server release. An anonymous pull of its manifest confirms it: the token request and the manifest request should both return 200.
- Some older sections still describe earlier versions. They are historical and are kept on purpose.
- In Windows PowerShell, `git` and `npm` outputs can be mistaken for failures. Check the exit state or the registry, not just the colour of the output.

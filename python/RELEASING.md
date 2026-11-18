# Releasing the Python SDK

Run these from the repository root. The package version is `version` in `python/pyproject.toml`, and `parmana.__version__` reads it from the installed package metadata, so there is one place to change.

## 1. Prepare

1. Bump `version` in `python/pyproject.toml`, and the `SDK v...` line in `python/examples/quickstart/README.md`.
2. Add a note to `docs/site/changelog.mdx` describing what changed.
3. Make sure CI is green on the `Python SDK` workflow (ruff, black, mypy, pytest on 3.11, 3.12 and 3.13).

## 2. Build and check

Build the way the release workflow does, so the output is the same bytes. The build tools are the
hash-pinned ones in `.github/release/build-requirements.txt`, and the timestamp is the commit's:

```bash
python -m venv /tmp/parmana-build
/tmp/parmana-build/bin/pip install --require-hashes -r .github/release/build-requirements.txt
export PATH=/tmp/parmana-build/bin:$PATH
export SOURCE_DATE_EPOCH="$(git log -1 --format=%ct -- .github/release/release-manifest.json)"
mkdir -p /tmp/parmana-dist
python -m build --no-isolation --outdir /tmp/parmana-dist python
for sdist in /tmp/parmana-dist/*.tar.gz; do python .github/release/normalize_sdist.py "$sdist"; done
python -m twine check /tmp/parmana-dist/*
```

Install `twine` separately for the check step if it is not already installed. Both the wheel and the
source distribution must report `PASSED`. The release workflow runs the same build twice and fails if
the bytes differ, so a local build of the same commit should match the files on the release page.

## 3. Test the built artifact in a clean environment

```bash
python -m venv /tmp/parmana-venv
/tmp/parmana-venv/bin/pip install /tmp/parmana-dist/parmana-<version>-py3-none-any.whl
/tmp/parmana-venv/bin/python -c "import parmana; print(parmana.__version__)"
/tmp/parmana-venv/bin/pip install "/tmp/parmana-dist/parmana-<version>-py3-none-any.whl[verify]"
/tmp/parmana-venv/bin/python -c "from parmana.crypto import verify_execution_trust_record_offline"
```

A plain install must import `parmana`, and `parmana.crypto` must only work after the `verify` extra installs `cryptography`.

## 4. Publish a GitHub release

Merge the version bump to `main` first, then publish a GitHub release on a new tag `sdk-v<version>`
targeting `main`, as in `typescript/RELEASING.md` step 4 (one release covers all four SDKs).
`.github/workflows/release.yml` attaches the wheel and source distribution for `parmana` and
`parmana-connector-sdk`, an SBOM for each wheel, and signed SLSA provenance. Wait for the run to be
green and the release to show eleven files.

## 5. Publish the release's own files to PyPI

Publish the files the release built, not a local build, so the packages on PyPI are byte for byte
the ones the provenance covers. Download `parmana-<version>-py3-none-any.whl` and
`parmana-<version>.tar.gz` from the release page (or `gh release download sdk-v<version> --pattern 'parmana-*'`), then:

```bash
python -m twine check parmana-<version>*
python -m twine upload parmana-<version>*
```

Publishing needs a PyPI API token for the `parmana` project. Never commit the token. Use
`--repository testpypi` first if you want a dry run. `parmana-connector-sdk` is published the same
way from its `parmana_connector_sdk-<version>*` files.

## 6. After publishing

1. Confirm the new version at `https://pypi.org/project/parmana/<version>/` and that `pip install "parmana==<version>"` works in a clean environment.
2. Check that the SHA-256 PyPI shows for each file equals `sha256sum` of the release's file.
3. Update the published version statements in `docs/site/sdks/python.mdx`.

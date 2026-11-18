"""Check that every file on npm and PyPI for a release is byte for byte the file the release provenance covers.

Usage: python check-registry-matches-release.py <version>        (for example 4.0.1)

For each package the release publishes, this downloads the file the registry
serves, computes its SHA-256 and compares it with the subject of the same name
in the release's SLSA provenance (multiple.intoto.jsonl on the sdk-v<version>
release). It fails if any file is missing from the registry, is not in the
provenance, or differs.

It reads the registries and the GitHub release over HTTPS only, and uses only
the standard library. It writes nothing. Run it after the packages are
published, and before announcing the release as complete.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request

REPO = "pavancharak/parmana-core"
NPM_PACKAGES = [
    "@parmana/sdk",
    "@parmana/connector-sdk",
    "@parmana/shared",
    "@parmana/crypto",
    "@parmana/cli",
]
PYPI_PACKAGES = ["parmana", "parmana-connector-sdk"]


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "parmana-release-check"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def provenance_subjects(version: str) -> dict[str, str]:
    """Return {file name: sha256} for every subject in the release's provenance."""
    url = f"https://github.com/{REPO}/releases/download/sdk-v{version}/multiple.intoto.jsonl"
    bundle = json.loads(fetch(url))
    statement = json.loads(base64.b64decode(bundle["dsseEnvelope"]["payload"]))
    subjects: dict[str, str] = {}
    for subject in statement["subject"]:
        name = subject["name"]
        if name.endswith(".cdx.json"):
            continue
        subjects[name] = subject["digest"]["sha256"]
    return subjects


def npm_file_name(package: str, version: str) -> str:
    # @parmana/connector-sdk -> parmana-connector-sdk-<version>.tgz (the release file name)
    short = package.split("/", 1)[1]
    return f"parmana-{short}-{version}.tgz"


def registry_files(version: str) -> list[tuple[str, str]]:
    """Return (file name, download URL) for every file the registries serve for this version."""
    files: list[tuple[str, str]] = []
    for package in NPM_PACKAGES:
        meta = json.loads(fetch(f"https://registry.npmjs.org/{package}/{version}"))
        files.append((npm_file_name(package, version), meta["dist"]["tarball"]))
    for package in PYPI_PACKAGES:
        meta = json.loads(fetch(f"https://pypi.org/pypi/{package}/{version}/json"))
        for entry in meta["urls"]:
            files.append((entry["filename"], entry["url"]))
    return files


def main(argv: list[str]) -> int:
    if len(argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", argv[1]):
        print(__doc__, file=sys.stderr)
        return 2
    version = argv[1]
    try:
        expected = provenance_subjects(version)
        files = registry_files(version)
    except (urllib.error.URLError, KeyError, ValueError) as error:
        print(f"could not read the release or the registries: {error}", file=sys.stderr)
        return 2

    failures = 0
    for name, url in files:
        if name not in expected:
            print(f"NOT IN PROVENANCE  {name}  ({url})")
            failures += 1
            continue
        actual = hashlib.sha256(fetch(url)).hexdigest()
        if actual == expected[name]:
            print(f"MATCH              {name}")
        else:
            print(f"DIFFERS            {name}  registry {actual}  release {expected[name]}")
            failures += 1

    listed = {name for name, _ in files}
    for name in sorted(set(expected) - listed):
        print(f"NOT ON REGISTRY    {name}")
        failures += 1

    if failures:
        print(f"\n{failures} problem(s): the registries do not serve the files the release provenance covers.")
        return 1
    print(f"\nAll {len(files)} registry files match the sdk-v{version} provenance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

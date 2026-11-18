"""Rewrite a .tar.gz package so that the same source always gives the same bytes.

Usage: SOURCE_DATE_EPOCH=<seconds> python normalize_sdist.py <file.tar.gz>

Works for Python source distributions and for npm packages (.tgz).

The build records the time, the owners and the file modes of the machine
that built the archive, so two builds of the same commit differ in SHA-256.
Modes in particular differ: a file the build machine marks executable is
recorded as executable on one machine and not on another. This script rewrites
the archive with:

- every timestamp set to SOURCE_DATE_EPOCH, and the gzip header time and name empty;
- owners set to root;
- directories 0755;
- files 0644, except files an npm package declares as a command in its
  `bin` field, which are 0755. npm sets those executable when it installs
  them, so the value written here is the one the registry copy carries;
- members in sorted order.

The modes of the source are not kept. Member contents are copied unchanged.

Uses only the standard library. The release job runs it after `python -m build`
and `npm pack`.
"""

from __future__ import annotations

import gzip
import io
import json
import os
import posixpath
import sys
import tarfile
from pathlib import Path


def bin_paths(source: tarfile.TarFile) -> set[str]:
    """Return the archive member names of the files an npm package declares as commands."""
    for member in source.getmembers():
        parts = member.name.split("/")
        if len(parts) == 2 and parts[1] == "package.json" and member.isfile():
            manifest = json.loads(source.extractfile(member).read())
            bin_field = manifest.get("bin", {})
            if isinstance(bin_field, str):
                targets = [bin_field]
            else:
                targets = list(bin_field.values())
            root = parts[0]
            return {posixpath.normpath(posixpath.join(root, target)) for target in targets}
    return set()


def normalize(path: Path, epoch: int) -> None:
    with tarfile.open(path, "r:gz") as source:
        commands = bin_paths(source)
        members = sorted(source.getmembers(), key=lambda member: member.name)
        entries = []
        for member in members:
            if not (member.isfile() or member.isdir()):
                raise SystemExit(f"{path.name}: unsupported member {member.name!r} ({member.type!r})")
            clean = tarfile.TarInfo(member.name)
            clean.mtime = epoch
            clean.uid = clean.gid = 0
            clean.uname = clean.gname = ""
            if member.isdir():
                clean.type = tarfile.DIRTYPE
                clean.mode = 0o755
                entries.append((clean, None))
            else:
                clean.type = tarfile.REGTYPE
                clean.mode = 0o755 if member.name in commands else 0o644
                data = source.extractfile(member).read()
                clean.size = len(data)
                entries.append((clean, data))

    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w", format=tarfile.PAX_FORMAT) as target:
        for info, data in entries:
            target.addfile(info, io.BytesIO(data) if data is not None else None)

    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=epoch) as compressed:
            compressed.write(tar_buffer.getvalue())


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    raw_epoch = os.environ.get("SOURCE_DATE_EPOCH")
    if not raw_epoch or not raw_epoch.isdigit():
        print("SOURCE_DATE_EPOCH must be set to a whole number of seconds", file=sys.stderr)
        return 2
    normalize(Path(argv[1]), int(raw_epoch))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

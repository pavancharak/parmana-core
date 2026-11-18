"""Rewrite a source distribution (.tar.gz) so that the same source always gives the same bytes.

Usage: SOURCE_DATE_EPOCH=<seconds> python normalize_sdist.py <file.tar.gz>

setuptools writes the sdist's root directory and the gzip header with the time
of the build, and the owners and file modes of the machine that built it. Two
builds of the same commit therefore differ in SHA-256. This script rewrites
the archive with every timestamp set to SOURCE_DATE_EPOCH, owners set to root,
modes set to 0644 (0755 for directories and files that were executable),
members in sorted order and an empty gzip name and time. Member contents are
copied unchanged.

Uses only the standard library. The release job runs it after `python -m build`.
"""

from __future__ import annotations

import gzip
import io
import os
import sys
import tarfile
from pathlib import Path


def normalize(path: Path, epoch: int) -> None:
    with tarfile.open(path, "r:gz") as source:
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
                clean.size = member.size
                clean.mode = 0o755 if member.mode & 0o111 else 0o644
                data = source.extractfile(member)
                entries.append((clean, data.read()))

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

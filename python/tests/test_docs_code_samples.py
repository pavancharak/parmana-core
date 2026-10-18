"""
Python code samples in the docs (docs/site/**/*.mdx) that import parmana
are checked against the SDK with mypy, the way test_api_reference_samples.py
checks the API reference samples. A docs sample is often a fragment, so
only errors that mean the sample disagrees with the SDK fail: a name that
does not exist in parmana, a method or attribute the SDK does not have, a
keyword argument it does not take. A name the fragment assumes is in scope
does not. The TypeScript samples, and the policies and signals every
request sample names, are checked by tests/architecture/docs-code-samples.test.ts.
"""

import re
import tempfile
from pathlib import Path

from mypy import api

DOCS = Path(__file__).resolve().parents[2] / "docs" / "site"

FENCE = re.compile(r"^([ \t]*)```python[^\n]*\n(.*?)^\1```", re.MULTILINE | re.DOTALL)

# mypy error codes that mean the sample disagrees with the SDK.
SDK_MISMATCH = ("[attr-defined]", "[call-arg]", "[arg-type]", "[union-attr]")

MYPY_LINE = re.compile(r"^(.*?\.py):(\d+): error: (.*)$")


def _samples() -> list[tuple[str, int, str]]:
    found = []
    for page in sorted(DOCS.rglob("*.mdx")):
        text = page.read_text(encoding="utf-8")
        for match in FENCE.finditer(text):
            indent = match.group(1)
            code = "\n".join(
                line[len(indent) :] if line.startswith(indent) else line
                for line in match.group(2).split("\n")
            )
            if re.search(r"^\s*(from|import) parmana", code, re.MULTILINE):
                line = text[: match.start()].count("\n") + 1
                found.append((page.relative_to(DOCS).as_posix(), line, code))
    return found


def test_finds_the_samples_it_checks() -> None:
    assert len(_samples()) >= 30


def test_python_samples_agree_with_the_sdk() -> None:
    samples = _samples()

    with tempfile.TemporaryDirectory() as directory:
        where = {}
        for index, (page, line, code) in enumerate(samples):
            name = f"sample_{index}.py"
            (Path(directory) / name).write_text(code, encoding="utf-8")
            where[name] = (page, line)

        stdout, stderr, _ = api.run(
            [
                "--ignore-missing-imports",
                "--no-error-summary",
                "--show-error-codes",
                "--follow-imports=silent",
                directory,
            ]
        )

    problems = []
    for message in stdout.splitlines():
        # "<path>.py:<line>: error: <text> [<code>]"; the path may hold a
        # drive letter colon on Windows, so match from the ".py:" on.
        parsed = MYPY_LINE.match(message)
        if parsed is None or not message.endswith(SDK_MISMATCH):
            continue
        name = Path(parsed.group(1)).name
        if name not in where:
            continue
        page, line = where[name]
        problems.append(f"{page}:{line + int(parsed.group(2))}: {parsed.group(3)}")

    assert problems == [], "\n".join(problems) + stderr

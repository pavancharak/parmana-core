"""
The Python sample on every API reference page (examples/api_reference/,
put into the OpenAPI bundle by scripts/add-openapi-code-samples.ts) is
checked here the way the SDK itself is: mypy --strict, so a sample that
calls a method that does not exist, or with the wrong arguments, fails.
"""

from pathlib import Path

from mypy import api

SAMPLES = Path(__file__).resolve().parent.parent / "examples" / "api_reference"


def test_there_is_a_sample_per_operation() -> None:
    assert len(list(SAMPLES.glob("*.py"))) >= 48


def test_every_sample_type_checks_strictly() -> None:
    stdout, stderr, status = api.run(["--strict", str(SAMPLES)])

    assert status == 0, stdout + stderr

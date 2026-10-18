"""Write a CycloneDX 1.5 SBOM for a built Python wheel.

Usage: python python_sbom.py <wheel> <output.json> [extra,extra]

Installs the wheel, with the optional extras named (for users, such as
`verify`; never development extras), into a new, empty virtual environment
(no pip, no setuptools), then lists exactly the distributions installed
there. The wheel is the SBOM's subject; everything else is a component. No
dependency graph is written: this records a flat list rather than a
guessed graph. Versions are what pip resolved when the release was built;
a later install can resolve newer versions within the declared ranges.

Uses only the standard library, so the release job needs no extra tools.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import uuid
import venv
import zipfile
from datetime import datetime, timezone
from email.parser import Parser
from pathlib import Path

LIST_DISTRIBUTIONS = (
    "import json, importlib.metadata as m; "
    "print(json.dumps(sorted("
    "({'name': d.metadata['Name'], 'version': d.version, "
    "'expression': d.metadata.get('License-Expression'), 'license': d.metadata.get('License')} "
    "for d in m.distributions()), key=lambda x: x['name'].lower())))"
)


def normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def wheel_metadata(wheel: Path) -> tuple[str, str, list[str]]:
    with zipfile.ZipFile(wheel) as archive:
        path = next(n for n in archive.namelist() if n.endswith(".dist-info/METADATA"))
        metadata = Parser().parsestr(archive.read(path).decode("utf-8"))
    return metadata["Name"], metadata["Version"], metadata.get_all("Provides-Extra") or []


def component(
    name: str, version: str, expression: str | None = None, license_text: str | None = None
) -> dict:
    purl = f"pkg:pypi/{normalize(name)}@{version}"
    entry: dict = {
        "type": "library",
        "bom-ref": purl,
        "name": name,
        "version": version,
        "purl": purl,
    }
    # An SPDX expression only from License-Expression; the older free text
    # License field is recorded as a name, not as an expression.
    if expression:
        entry["licenses"] = [{"expression": expression}]
    elif license_text and len(license_text) < 100:
        entry["licenses"] = [{"license": {"name": license_text}}]
    return entry


def main() -> None:
    wheel = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2])
    name, version, declared = wheel_metadata(wheel)
    extras = [e for e in (sys.argv[3].split(",") if len(sys.argv) > 3 else []) if e]
    unknown = [e for e in extras if e not in declared]
    if unknown:
        sys.exit(f"{name} declares no extra named {', '.join(unknown)}; it declares {', '.join(declared) or 'none'}.")

    with tempfile.TemporaryDirectory() as directory:
        venv.create(directory, with_pip=False)
        python = Path(directory) / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
        target = f"{wheel}[{','.join(extras)}]" if extras else str(wheel)
        subprocess.run(
            [sys.executable, "-m", "pip", "--python", str(python), "install",
             "--quiet", "--disable-pip-version-check", target],
            check=True,
        )
        installed = json.loads(
            subprocess.run([str(python), "-c", LIST_DISTRIBUTIONS],
                           check=True, capture_output=True, text=True).stdout
        )

    root = component(name, version)
    components = [
        component(d["name"], d["version"], d["expression"], d["license"])
        for d in installed
        if normalize(d["name"]) != normalize(name)
    ]
    bom = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{uuid.uuid4()}",
        "version": 1,
        "metadata": {
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "tools": {"components": [{"type": "application", "name": "parmana python_sbom.py"}]},
            "component": root,
            "properties": [{"name": "parmana:extras-included", "value": ",".join(extras) or "none"}],
        },
        "components": components,
    }
    output.write_text(json.dumps(bom, indent=2) + "\n", encoding="utf-8")
    print(f"{output}: {name} {version}, {len(components)} components")


if __name__ == "__main__":
    main()

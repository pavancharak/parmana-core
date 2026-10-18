"""
Example 01

Health Check
"""

from __future__ import annotations

import json

from parmana import ParmanaClient


def main() -> None:
    client = ParmanaClient(
        endpoint="http://localhost:3000",
    )

    health = client.execution.health()

    print(
        json.dumps(
            health,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

"""
Parmana SDK Version.
"""

from importlib.metadata import PackageNotFoundError, version

__title__ = "parmana"

__description__ = "Python SDK for Parmana Execution Trust Infrastructure."

try:
    __version__ = version("parmana")
except PackageNotFoundError:
    # Not installed (e.g. running from a source checkout without
    # `pip install -e .` / `pip install .` having been run).
    __version__ = "0.0.0+unknown"

__author__ = "Parmana"

__license__ = "Apache-2.0"

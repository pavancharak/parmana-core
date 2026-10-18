"""
SDK Information.
"""

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="http://localhost:3000",
)

print(client)

print(client.version)

print(client.endpoint)

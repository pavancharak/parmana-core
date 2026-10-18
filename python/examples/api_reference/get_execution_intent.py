import os

from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana-api-real.vercel.app",
    api_key=os.environ["PARMANA_API_KEY"],
)

view = client.execution_intent("5f0c2a7e-3d7b-4d0e-9a55-2f6d8b1c4e90")

print(view.status.state)

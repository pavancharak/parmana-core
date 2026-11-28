# openai-agents: stale tool approval across runs

Offline reproduction of openai/openai-agents-python#5413. Uses `ScriptedModel`; no API key or network needed.

## Run

    pip install openai-agents==0.26.0
    python repro.py

## Observed output (openai-agents 0.26.0 from PyPI)

    after run 1: ['A']
    run 2 interruptions before stale approve: 1
    run 2 interruptions after resume: 0
    executed: ['A', 'A']

Run 2 is a new run on the same `Agent` instance, reusing the `call_id` and arguments from run 1. Passing run 1's `ToolApprovalItem` to `approve()` resolves run 2's pending approval, and the tool executes again without a new decision in run 2.

## Scope

- Confirmed only on the PyPI release 0.26.0. Not run against the upstream `main` branch.
- Offline scripted model only. Real provider behavior not tested.

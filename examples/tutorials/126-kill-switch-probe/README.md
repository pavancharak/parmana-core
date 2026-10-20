# Tutorial 126 — Kill Switch: External Probe

## Objective

Show how the kill switch is checked from outside Parmana. A scheduler sends a harmless request, reports what came back, and Parmana records whether the refusal matched the switch state.

## What You'll Learn

- A probe sent while the switch is tripped should be refused with `KILL_SWITCH_ACTIVE`. The probe passes.
- A probe sent while the switch is off should not be refused by the switch. The probe passes.
- A reported status that does not match the switch state is recorded as failed. This is how a silent failure is caught.
- Every probe result is kept, so a question about a past period can be answered.

## Running the Tutorial

```bash
npx tsx examples/tutorials/126-kill-switch-probe/run.ts
```

The run prints a PASS or FAIL for each check and exits with an error if any check fails.

## Why This Matters

The switch is only useful if it is seen to work. A probe that runs on a schedule shows whether requests are refused when they should be. In production the scheduler runs from a GitHub Actions workflow with a key that can only record probes.

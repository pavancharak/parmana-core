# Tutorial 125 — Kill Switch: Two-Person Reset

## Objective

Show that in production the kill switch cannot be cleared by one person. A reset is held as pending until a second, different operator confirms it.

## What You'll Learn

- The first reset request answers `202` with `outcome: "pending"`. The switch stays on.
- The same operator cannot confirm their own request (`409 SAME_OPERATOR_CANNOT_CONFIRM_RESET`).
- A different operator with `kill-switch:reset` completes the reset (`200`), and the record names both operators.
- The setting `resetNeedsSecondOperator` decides this. Production sets it to `true`.

## Running the Tutorial

```bash
npx tsx examples/tutorials/125-kill-switch-two-person-reset/run.ts
```

The run prints a PASS or FAIL for each check and exits with an error if any check fails.

## Why This Matters

A stop that one person can clear with no review is weak. Two-person reset is the production rule for the operator kill switch.

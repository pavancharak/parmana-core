# Tutorial 127 — Checker Scope

## Objective

Show that approving a policy change is limited to the checkers named for that policy, and that a malformed setting stops startup.

## What You'll Learn

- `POLICY_CHANGE_CHECKERS` is a JSON object from policy name to a list of caller ids.
- A caller who is not listed for a policy is refused with `CHECKER_NOT_IN_SCOPE` before the step-up signature is checked.
- A policy with no entry allows nobody. An unset variable lists nobody, so no policy change can be approved until the setting is made.
- A malformed value is refused at startup. It is never guessed at.

## Running the Tutorial

```bash
npx tsx examples/tutorials/127-checker-scope/run.ts
```

The run prints a PASS or FAIL for each check and exits with an error if any check fails.

## Why This Matters

Approval power for a policy should belong to named people, not to anyone holding an approver credential. This setting is what makes that enforceable.

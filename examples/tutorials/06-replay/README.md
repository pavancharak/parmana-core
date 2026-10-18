# Tutorial 06 — Replay

## Overview

This tutorial demonstrates deterministic replay of an Execution Trust Record.

Replay re-executes the recorded policy decision using the original policy and execution signals to verify that the same decision is produced.

This capability provides independent verification and auditability.

---

## Learning Objectives

After completing this tutorial you will understand:

- Execution Replay
- Deterministic Evaluation
- Recorded Decision
- Replayed Decision
- Replay Verification

---

## Files

| File     | Purpose                           |
| -------- | --------------------------------- |
| `run.ts` | Replays an Execution Trust Record |

---

## Architecture

```
Execution Trust Record
  │
  ▼
Replay Engine
  │
  ▼
Policy Evaluation
  │
  ▼
Replay Result
```

---

## Run

```bash
npm run example -- 06-replay
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints:

- Recorded Decision
- Replayed Decision
- Replay Result
- Match Status

---

## Next Tutorial

Continue to **Tutorial 07 – Receipt Generation**.

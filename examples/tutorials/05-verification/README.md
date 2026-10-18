# Tutorial 05 — Verification

## Overview

This tutorial demonstrates how Parmana verifies an Execution Trust Record.

Verification confirms that an Execution Trust Record has not been modified and that its cryptographic evidence remains valid.

No Runtime execution occurs.

No Replay occurs.

---

## Learning Objectives

After completing this tutorial you will understand:

- Execution Trust Record
- Verification
- Cryptographic Integrity
- Verification Result

---

## Files

| File     | Purpose                            |
| -------- | ---------------------------------- |
| `run.ts` | Verifies an Execution Trust Record |

---

## Architecture

```
Execution Trust Record
  │
  ▼
 Verification Engine
  │
  ▼
 Verification Result
```

---

## Run

```bash
npm run example -- 05-verification
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints:

- Execution Trust Record
- Verification Result

No Runtime execution occurs.

No Replay occurs.

---

## Next Tutorial

Continue to **Tutorial 06 – Replay**.

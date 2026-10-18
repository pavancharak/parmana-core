# Tutorial 04 — Policy Router

## Overview

This tutorial demonstrates how Parmana resolves a policy reference to a concrete policy definition.

The Policy Router uses the policy name and version from a Business Transaction to locate the corresponding policy in the policy repository.

No Runtime execution occurs.

No Trust Record is generated.

---

## Learning Objectives

After completing this tutorial you will understand:

- Policy References
- FilePolicyRepository
- PolicyRouter
- Policy Resolution
- Policy Versioning

---

## Files

| File               | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `transaction.json` | Business Transaction containing a Policy Reference |
| `run.ts`           | Loads the policy through the Policy Router         |

---

## Architecture

```
Business Transaction
        │
        ▼
Policy Reference
        │
        ▼
Policy Router
        │
        ▼
File Policy Repository
        │
        ▼
policy.json
```

---

## Run

```bash
npm run example -- 04-policy-router
```

or

```bash
tsx run.ts
```

---

## Expected Output

The tutorial prints:

- Policy Reference
- Resolved Policy
- Policy Version

No policy evaluation occurs.

No Runtime execution occurs.

---

## Next Tutorial

Continue to **Tutorial 05 – Verification**.

# Shared Assets

## Overview

This directory contains reusable assets shared across the Parmana tutorials and scenarios.

Unlike the tutorials and scenarios, these files are not intended to demonstrate a specific capability. Instead, they provide common helper functions, reference policies, and sample business transactions that reduce duplication across examples.

---

# Directory Structure

```
shared/
├── helpers/
│   ├── load-json.ts
│   ├── print.ts
│   └── save-output.ts
│
├── policies/
│   └── default-policy.json
│
└── transactions/
    ├── vendor-payment.json
    └── expense-approval.json
```

---

# Helpers

The **helpers** directory contains small utility functions used by multiple examples.

| File             | Purpose                              |
| ---------------- | ------------------------------------ |
| `load-json.ts`   | Reads and parses JSON files          |
| `print.ts`       | Pretty-prints objects to the console |
| `save-output.ts` | Writes example output to disk        |

These helpers keep the tutorial code focused on Parmana concepts rather than file handling or console formatting.

---

# Policies

The **policies** directory contains reusable policy definitions used by examples.

Current contents:

- `default-policy.json`

Tutorials may define their own policies, while scenarios typically reference the canonical policies under the repository's `policies/` directory.

---

# Transactions

The **transactions** directory contains reusable Business Transaction examples.

Current contents:

- `vendor-payment.json`
- `expense-approval.json`

These files provide common input data for examples and can also serve as templates when creating new scenarios.

---

# Design Principles

The shared directory follows three principles:

- **Reusable** — Assets should be usable across multiple tutorials and scenarios.
- **Generic** — Shared files should avoid scenario-specific behavior whenever possible.
- **Minimal** — Only include files that are genuinely shared to keep the examples easy to understand.

---

# Usage

Import helper utilities:

```ts
import { loadJson } from "../shared/helpers/load-json.js";

import { print } from "../shared/helpers/print.js";
```

Load a shared transaction:

```ts
const transaction = await loadJson(
  "../shared/transactions/vendor-payment.json",
);
```

---

# Notes

The files in this directory are intended to support the examples.

For production applications, use the packages under the `packages/` directory (`@parmana/runtime`, `@parmana/policy`, `@parmana/crypto`, etc.) rather than relying on these helper utilities.

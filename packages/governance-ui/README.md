# @parmana/governance-ui

Policy Governance internal UI: propose/list/diff-review for pending policy changes. Read-only by design -- approve/reject stay CLI-only via scripts/sign-policy-change-step-up.ts, since step-up's security depends on the checker's private key never leaving their machine.

This package is part of [Parmana](https://docs.parmanasystems.com), the authorization layer for AI execution. Read the [Parmana documentation](https://docs.parmanasystems.com) for how it fits with the rest of the system.

## Install

```bash
npm install @parmana/governance-ui
```

Requires Node.js 24 or later.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

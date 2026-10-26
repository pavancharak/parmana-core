# Open-source work: status and working rules

This file keeps the context for contribution work across sessions. Update it
when a PR merges or an outside project replies. It is not a product document.

## Parmana PRs (pavancharak/parmana-core)

| PR   | Change                                                                               | Status |
| ---- | ------------------------------------------------------------------------------------ | ------ |
| #128 | Prettier formatting for files the format check flagged; connector capability tests   | Merged |
| #131 | Node 22 setup note; restored wording that Prettier had corrupted in `http_error.mdx` | Merged |
| #133 | Python reference regeneration reproduces the committed pages exactly                 | Merged |
| #134 | Five truncated page descriptions completed                                           | Merged |
| #136 | CI runs the format check and a Python reference drift job                            | Merged |

## Outside projects

- **Vengtoo MCP Gateway** (`vengtoo/mcp-gateway`, Apache-2.0). The `authzx/mcp-gateway` repo has the same package name, but it has not been confirmed as the same repository. It sits in front of MCP tool calls and writes an unsigned JSON audit line per call (`src/audit.ts`).
- **Issue #2** on `vengtoo/mcp-gateway`: "Sign audit records so they can be verified outside the gateway". Proposes an optional Ed25519 signature per record, hash-chained to the previous record, plus an offline verifier. It asks whether signing is in scope, and whether signatures go on each record or on periodic checkpoints. Status: open, no maintainer reply recorded yet.
- Other candidates considered: MCPGuard, jamjet-policy, withHuman, HumanLayer, awaithumans, Agent Receipts (obsigna), Signet, raucle.

## Working rules

- Node 24 is required. Under Node 22 the distrust-root tests fail, and a `re2` native module built for Node 22 needs `npm rebuild re2` after switching.
- Commits carry a `Signed-off-by` line and the session link. Do not name a model in commits, PR titles or bodies.
- Open a PR only when asked. Watch a PR only when asked.
- If a PR for the working branch has merged, restart the branch from `origin/main` and rebase any unmerged commits onto it.
- Never bypass the pre-commit hook.
- Regenerate the Python SDK reference with the version pinned in `python/requirements-dev.txt` (`pydoc-markdown==4.8.2`).
- The GitHub tools only reach repositories attached to the session. Attach an outside repository with `add_repo` before reading its issues.

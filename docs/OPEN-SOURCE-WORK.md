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

Status as of 2026-10-26. No maintainer has replied on any item below. Each comment was posted by the operator, and the operator decides the next step.

| Project                                                              | Item                                                                                                                                | Our post                                                                                                                               | Status                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vengtoo MCP Gateway (`vengtoo/mcp-gateway`, Apache-2.0)              | [Issue #2](https://github.com/vengtoo/mcp-gateway/issues/2): signed audit records                                                   | Two comments: design (per-record signature, hash chain, checkpoints) and an update (rotatable keys, configurable algorithm, witnesses) | Open, no labels, no assignee, no maintainer reply                                                                                                   |
| OPA (`open-policy-agent/opa`, Apache-2.0)                            | [Issue #9426](https://github.com/open-policy-agent/opa/issues/9426): ecosystem entry and Envoy to OPA to Parmana guide              | Feature request, no comments yet                                                                                                       | Open, no labels, no assignee                                                                                                                        |
| NVIDIA NeMo Guardrails (Apache-2.0)                                  | [Issue #2245](https://github.com/NVIDIA-NeMo/Guardrails/issues/2245): external policy-engine example for custom actions             | Offer comment posted by the operator. The page did not show it in the last check: confirm it in the browser                            | Open, "needs triage", no assignee. The issue author (ktirupati) already has an exploratory PolicyAware example and asks to be assigned after triage |
| Model Context Protocol (`modelcontextprotocol/modelcontextprotocol`) | [Issue #3394](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394): lost-response retry re-executes tool calls | Comment: single-use authorization with a signed nonce, implemented at the gateway                                                      | Open, no reply visible. Eight comments are hidden behind "Load more"                                                                                |
| Anthropic Claude Code (`anthropics/claude-code`)                     | [Issue #103994](https://github.com/anthropics/claude-code/issues/103994): a PreToolUse hook's `ask` is overridden in bypass mode    | Comment: asks whether `ask` should hold in every permission mode, and offers a repro                                                   | Open, no Anthropic reply. Labels: bug, area:hooks, area:permissions, has repro. Contribution rules not confirmed (CONTRIBUTING returned 404)        |

Also checked and held: OpenBox (reference repo not reachable from this session: 404). Anthropic Agent SDK (CONTRIBUTING returned 404). Candidates still to check: Sigstore (Rekor and Cosign, Apache-2.0; its contributor rules were read, but the Rekor CONTRIBUTING page returned 404), in-toto, LangGraph. Earlier candidates, not yet checked: MCPGuard, jamjet-policy, withHuman, HumanLayer, awaithumans, Agent Receipts (obsigna), Signet, raucle.

Contribution rules learned so far:

- **NeMo Guardrails:** an issue must come first, and the contributor must be assigned to it before opening a PR. DCO sign-off is required. Disclose AI assistance in the PR description.
- **OPA:** feature requests start as an issue. Every commit needs a human sign-off. AI may help write code, but issue text, PR descriptions, and replies must be written by a human. Reviewers reject discussion that uses AI-generated replies.
- **MCP:** spec changes follow the SEP process. Discuss on Discord with a working group, build a prototype, then write the SEP. AI assistance must be disclosed in the PR or issue.
- **Sigstore:** issue first, DCO sign-off, updated docs, passing CI, maintainer review.

## Working rules

- Node 24 is required. Under Node 22 the distrust-root tests fail, and a `re2` native module built for Node 22 needs `npm rebuild re2` after switching.
- Commits carry a `Signed-off-by` line and the session link. Do not name a model in commits, PR titles or bodies.
- Open a PR only when asked. Watch a PR only when asked.
- If a PR for the working branch has merged, restart the branch from `origin/main` and rebase any unmerged commits onto it.
- Never bypass the pre-commit hook.
- Regenerate the Python SDK reference with the version pinned in `python/requirements-dev.txt` (`pydoc-markdown==4.8.2`).
- The GitHub tools only reach repositories attached to the session. Attach an outside repository with `add_repo` before reading its issues.

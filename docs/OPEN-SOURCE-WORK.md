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

Also checked and held: OpenBox (reference repo not reachable from this session: 404). Anthropic Agent SDK (CONTRIBUTING returned 404). LangGraph (`langchain-ai/langgraph`): research only, nothing posted. `interrupt()` pauses a graph and resumes with `Command(resume=...)`, which fits an approval step. The docs describe human review, not an automated policy hook before a tool runs. Nine open issues matched; none mention policy or authorization. Most relevant to approval safety: #8039 (replay order under `durability="sync"`), #7417 (long tool calls re-executed from checkpoint), #9240 (durability modes do not give exactly-once side effects). CONTRIBUTING returned 404 on both GitHub and raw URLs, so contribution rules are unverified.

in-toto (`in-toto/in-toto`): research only, nothing posted. Layouts are signed policy, and inspections and predicates are extension points. The two open issues found (#79, #109) are 2017 discussions and do not match a verifier plugin. The CONTRIBUTING page returned 404. Witness (`in-toto/go-witness`, the attestor and verifier project) is the more likely integration point. Its contribution rules: an issue is preferred, DCO sign-off, Conventional Commits, tests where possible, a maintainer must approve, and no AI disclosure rule was found. It had no open issues matching policy or verifier plugins.

Sigstore (research only, nothing posted). Cosign's attestation policies already accept CUE and Rego on in-toto predicates, so an external verdict check would overlap with existing features. Policy-controller has no open issue about external policy engines or OPA. The closest open issues are #2005 (matching fields across attestations) and #1891 (source repository metadata checks). Rekor's only open issue in the filtered search, #1944, is about certificate chains and does not touch policy. Contribution rules, Cosign: an issue is optional, DCO sign-off, `make test` and `make lint` must pass, `make docgen` when commands change, and the AI policy in `sigstore/.github` applies. The Rekor CONTRIBUTING page returned 404, so Rekor's rules are unverified.

Earlier candidates, not yet checked: MCPGuard, jamjet-policy, withHuman, HumanLayer, awaithumans, Agent Receipts (obsigna), Signet, raucle.

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

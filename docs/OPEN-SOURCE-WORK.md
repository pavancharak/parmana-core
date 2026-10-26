# Open-source work: status and working rules

This file keeps the context for contribution work across sessions. Update it
when a PR opens or merges, or when an outside project replies. It is not a
product document.

Status as of 2026-10-26.

## Parmana PRs (pavancharak/parmana-core)

| PR   | Change                                                                               | Status |
| ---- | ------------------------------------------------------------------------------------ | ------ |
| #128 | Prettier formatting for files the format check flagged; connector capability tests   | Merged |
| #131 | Node 22 setup note; restored wording that Prettier had corrupted in `http_error.mdx` | Merged |
| #133 | Python reference regeneration reproduces the committed pages exactly                 | Merged |
| #134 | Five truncated page descriptions completed                                           | Merged |
| #136 | CI runs the format check and a Python reference drift job                            | Merged |

## Pull requests opened on other projects

| Project | PR | Change | Status |
| ------- | -- | ------ | ------ |
| Agent Receipts (`agent-receipts/obsigna`, Apache-2.0) | [#1146](https://github.com/agent-receipts/obsigna/pull/1146) | Test vectors for a receipt with `action.target` and `parameters_hash`, signed by the Python and TypeScript SDKs and checked in all three SDKs. Test-only. Addresses the test gap in issue #1001 for those two signing paths. | Open. Two commits (`30f2b0b`, `7c402f5`), no reviews. Title and description set. Workflows from the fork need maintainer approval, so CI has not run upstream. |
| vengtoo MCP gateway (`vengtoo/mcp-gateway`, Apache-2.0) | Fork branch `pavancharak/mcp-gateway:fix/npm-audit` (commit `82833f5`), PR opened by the operator | `npm audit fix` on the lockfile only. Production audit shows 0 vulnerabilities. 52 tests pass and typecheck is clean. | Open upstream. The push to `authzx/mcp-gateway` was refused (403), so the fork carries the branch. |

## Outside projects: posts and watches

No maintainer has replied on any item below. Each comment was posted by the operator, and the operator decides the next step.

| Project | Item | Our post | Status |
| ------- | ---- | -------- | ------ |
| Vengtoo MCP Gateway (`vengtoo/mcp-gateway`, Apache-2.0) | [Issue #2](https://github.com/vengtoo/mcp-gateway/issues/2): signed audit records | Two comments: design (per-record signature, hash chain, checkpoints) and an update (rotatable keys, configurable algorithm, witnesses) | Open, no labels, no assignee, no maintainer reply |
| OPA (`open-policy-agent/opa`, Apache-2.0) | [Issue #9426](https://github.com/open-policy-agent/opa/issues/9426): ecosystem entry and Envoy to OPA to Parmana guide | Feature request, no comments yet | Open, no labels, no assignee |
| NVIDIA NeMo Guardrails (Apache-2.0) | [Issue #2245](https://github.com/NVIDIA-NeMo/Guardrails/issues/2245): external policy-engine example for custom actions | Offer comment posted by the operator. The page did not show it in the last check: confirm it in the browser | Open, "needs triage", no assignee. The issue author (ktirupati) already has an exploratory PolicyAware example and asks to be assigned after triage |
| Model Context Protocol (`modelcontextprotocol/modelcontextprotocol`) | [Issue #3394](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394): lost-response retry re-executes tool calls | Comment: single-use authorization with a signed nonce, implemented at the gateway | Open, no reply visible. Eight comments are hidden behind "Load more" |
| Anthropic Claude Code (`anthropics/claude-code`) | [Issue #103994](https://github.com/anthropics/claude-code/issues/103994): a PreToolUse hook's `ask` is overridden in bypass mode | Comment: asks whether `ask` should hold in every permission mode, and offers a repro | Open, no Anthropic reply. Labels: bug, area:hooks, area:permissions, has repro. Contribution rules not confirmed (CONTRIBUTING returned 404) |

## Research: candidates checked (nothing posted)

Ranked by overlap with Parmana. "Rules" lists what each project's own files say.

1. **Agent Receipts (`agent-receipts/obsigna`, Apache-2.0, protocol spec MIT, about 20 stars).** The closest match to Parmana's signed receipts and verifier. Rules: no issue required, but larger changes (new cryptographic choices, storage backends, protocol extensions, cross-SDK compatibility) need an ADR in `docs/adr/` first. Conventional Commits. AI agents are first-class contributors under `AGENTS.md`, which bans spec changes without human approval. No DCO, CLA, or AI-disclosure rule found. The repo's `CLAUDE.md` forbids Co-Authored-By trailers, "Generated with" lines, and session links in commits and PRs. Open issues: #1000 and #1001 are the test-only items the PR above addresses. #481 to #485 are protocol and security issues that need an ADR. The ADR set runs 0001 to 0039. Last commit date not shown.
2. **Signet (`prismer-ai/signet`, Apache-2.0 or MIT, 40 stars, 346 commits).** "Cryptographic trust and authorization evidence for AI agents." The closest project to Parmana's own model. Rules: CONTRIBUTING.md exists; fork, branch, tests, PR against `main`; Conventional Commits; `cargo test --workspace`, `cargo clippy -D warnings`, and `cargo fmt` must pass; all public functions need tests; no `unsafe`. No DCO, CLA, or AI-disclosure rule. No open issues, so a contribution would start with a new issue.
3. **JamJet Policy (`jamjet-labs/jamjet-policy`, Apache-2.0, 2 stars, 66 commits).** "The portable policy layer for AI agent actions," with one policy file and one audit trail across a Claude Code hook, an OpenAI guardrail, an MCP shim, Cedar policies, and an `approve` CLI. Direct overlap with Parmana's approval and audit path. No CONTRIBUTING, SECURITY, or DCO file. One open issue, #11 (source-rights evidence gate), and nothing on policy engines or audit signing. Its README says "four adapters" but lists five packages.
4. **withHuman / Agent Approval Protocol.** Calls itself open source with an open spec. The `github.com/withhuman` organization has zero public repositories, and the `withhuman/core` CONTRIBUTING page returned 404. Nothing to contribute to yet. Direct overlap, so it may compete. Recheck before any outreach.
5. **LangGraph (`langchain-ai/langgraph`).** `interrupt()` pauses a graph and resumes with `Command(resume=...)`, which fits an approval step. The docs describe human review, not an automated policy hook. Relevant open issues: #8039 (replay order under `durability="sync"`), #7417 (long tool calls re-executed from checkpoint), #9240 (durability modes do not give exactly-once side effects). CONTRIBUTING returned 404 on both URLs, so rules are unverified.
6. **Witness (`in-toto/go-witness`) and in-toto (`in-toto/in-toto`).** Layouts are signed policy; inspections and predicates are extension points. Witness is the likelier integration point. Rules: an issue is preferred, DCO sign-off, Conventional Commits, tests where possible, maintainer approval. No AI-disclosure rule found. No open issue matches a verifier plugin. The in-toto CONTRIBUTING page returned 404.
7. **Sigstore (Cosign, Policy Controller, Rekor).** Cosign already accepts CUE and Rego on in-toto predicates, so an external verdict check overlaps with existing features. Policy-controller has no open issue about external policy engines. Closest open issues: #2005 (matching fields across attestations) and #1891 (source repo metadata checks). Rules, Cosign: DCO sign-off, `make test` and `make lint`, `make docgen` when commands change, and the AI policy in `sigstore/.github` applies. The Rekor CONTRIBUTING page returned 404.

Not confirmed: MCPGuard, awaithumans, raucle (no repository found). HumanLayer has a fork and PyPI releases 0.5.7 to 0.5.11rc1; its upstream repository is unchecked. OpenBox (reference repo returned 404). Anthropic Agent SDK (CONTRIBUTING returned 404).

## Microsoft Agent Governance Toolkit (`microsoft/agent-governance-toolkit`, MIT)

Checked 2026-10-26 at commit `70a4ab8`. Research only, nothing posted. Public Preview, about 6.5k stars. Languages: Python, TypeScript, .NET, Rust, Go.

Audit code, read from the repo:
- **TypeScript** (`agent-governance-typescript/src/audit.ts`): a SHA-256 hash chain with no signature and no key. Anyone can recompute it, but it proves nothing about who wrote the entries.
- **Python** (`agent-governance-python/agent-mesh/src/agentmesh/governance/audit_backends.py`): `SignedAuditEntry` is a hash chain with an HMAC-SHA256 over a caller-supplied secret. Only a holder of that key can verify it. Third parties cannot.
- **Ed25519** appears only in the experimental `agent-os/modules/nexus` prototype, for manifests and escrow messages. I did not see job receipts signed there.
- **Conclusion:** the review's "no cryptographic signing" is close for the audit trail. Nothing is publicly verifiable by a third party. That is the gap a Parmana receipt would fill.

Contribution rules (`CONTRIBUTING.md`, `GOVERNANCE.md`):
- Core packages are maintainer-only. An outside contributor must open an issue and get explicit maintainer approval before a PR.
- `agentmesh-integrations/` accepts extensions from anyone. Each needs its own README, tests, and license notice, and must not modify core packages.
- CLA checked by a bot, and `git commit -s` on every commit.
- `ruff check --fix .` and `pytest tests/ -q`, with `ruff==0.12.4` pinned.
- AI use allowed, but the contributor must explain every change. Disclosure required for autonomous AI activity and for unreviewed AI content. Agents may not open PRs, file issues, or reply to reviews without human oversight, and AI must not write replies to review comments.
- External PRs need a maintainer code owner's approval. Bot approvals do not count.

Open issues that match Parmana:
- [#4363](https://github.com/microsoft/agent-governance-toolkit/issues/4363): ADR-0030 approval requests do not say which tool or action they approve. Closest match to Parmana's approvals.
- [#4298](https://github.com/microsoft/agent-governance-toolkit/issues/4298): RFC for an optional governance substrate for verified execution. Possible entry point.
- [#4217](https://github.com/microsoft/agent-governance-toolkit/issues/4217): external authority admission across federated runtimes.
- [#4374](https://github.com/microsoft/agent-governance-toolkit/issues/4374) and [#4375](https://github.com/microsoft/agent-governance-toolkit/issues/4375): a Cedar dispatcher and docs.
- No issue names receipts or cryptographic evidence directly.

Next step: take the approval-binding point to #4363 or #4298 as an issue, not a PR. Build any code as an `agentmesh-integrations/` extension after maintainers respond. ADR-0030 has not been read yet.

## Contribution rules learned so far

- **NeMo Guardrails:** an issue must come first, and the contributor must be assigned to it before opening a PR. DCO sign-off is required. Disclose AI assistance in the PR description.
- **OPA:** feature requests start as an issue. Every commit needs a human sign-off. AI may help write code, but issue text, PR descriptions, and replies must be written by a human. Reviewers reject AI-generated replies.
- **MCP:** spec changes follow the SEP process: discuss with a working group, build a prototype, then write the SEP. AI assistance must be disclosed.
- **Sigstore:** issue first, DCO sign-off, updated docs, passing CI, maintainer review.
- **Agent Receipts:** see the entry above. No model names, session links, or attribution lines in commits or PRs.

## Working rules

- Node 24 is required for Parmana. Under Node 22 the distrust-root tests fail, and a `re2` native module built for Node 22 needs `npm rebuild re2` after switching.
- Parmana commits carry a `Signed-off-by` line and the session link. Other repos follow their own `CLAUDE.md`. Do not name a model in any commit, PR title, or PR body.
- Open a PR only when asked. Watch a PR only when asked.
- Never bypass the pre-commit hook. When a commit-msg hook needs a tool (for example `convco`), install the tool rather than skipping the hook.
- If a PR for the working branch has merged, restart the branch from `origin/main` and rebase any unmerged commits onto it.
- Regenerate the Python SDK reference with the version pinned in `python/requirements-dev.txt` (`pydoc-markdown==4.8.2`).
- GitHub tools only reach repositories attached to the session. Attach an outside repository with `add_repo` before reading its issues or opening a PR there. Attaching with push access needs the session owner's approval.
- Anonymous `git clone` works for public repositories, but PR creation through the GitHub tools needs the repository attached.

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

| Project                                                 | PR                                                                                                                                                                                                                                                                         | Change                                                                                                                                                                                                                       | Status                                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Receipts (`agent-receipts/obsigna`, Apache-2.0)   | [#1146](https://github.com/agent-receipts/obsigna/pull/1146)                                                                                                                                                                                                               | Test vectors for a receipt with `action.target` and `parameters_hash`, signed by the Python and TypeScript SDKs and checked in all three SDKs. Test-only. Addresses the test gap in issue #1001 for those two signing paths. | Open. Two commits (`30f2b0b`, `7c402f5`), no reviews. Title and description set. Workflows from the fork need maintainer approval, so CI has not run upstream. |
| vengtoo MCP gateway (`vengtoo/mcp-gateway`, Apache-2.0) | Fork branch `pavancharak/mcp-gateway:fix/npm-audit` (commit `82833f5`). Upstream [vengtoo/mcp-gateway#3](https://github.com/vengtoo/mcp-gateway/pull/3), "fix(deps): resolve production npm audit findings," is open. Its head branch was not confirmed from this session. | `npm audit fix` on the lockfile only. Production audit shows 0 vulnerabilities. 52 tests pass and typecheck is clean.                                                                                                        | Fork branch pushed. The push to `authzx/mcp-gateway` was refused (403). Upstream PR open.                                                                      |

Parmana's own context PR: [#143](https://github.com/pavancharak/parmana-core/pull/143) on `claude/open-source-context`, not merged. Merging it is the operator's decision.

### Obsigna fix for #1001: local record

- Branch `test/py-rich-receipt-vectors` on the fork. Commits `30f2b0b` (Python-signed rich receipt) and `7c402f5` (TypeScript-signed). Both had the `Claude-Session` line removed from their messages, with `--force-with-lease`.
- The earlier local commits `04a7505` and `a335aff` are superseded by the rewritten history.
- Patches for both commits are in the sandbox scratchpad, not in this repo.
- Checks run before the commit: Python 565 passed, 7 skipped; TypeScript 501 passed; the Go SDK and cross-SDK suites pass; ruff, gofmt, vet, and tsc clean. Biome reports 2 warnings in `src/receipt/chain.ts`, which this change does not touch.
- Go test `TestCrossLanguagePyRichSignature` was shown to fail on a tampered vector and pass when restored.
- Design: `py_vectors.json` gains a `signingRich` entry, and `ts_rich_vectors.json` holds the same unsigned receipt signed by TypeScript. TypeScript and Python produce the same `proofValue`.

## Adoption plan: progress

Work is done one item at a time. Items 1 and 2 are done locally. Nothing is pushed upstream yet.

1. **Audit the claims** (done). On `docs/verifier-claims` (`7a26274`, pushed to `pavancharak/parmana-core`), the README now says that offline verification trusts only the key the reader chooses, and that the verifier cannot prove the key belongs to Parmana. The crypto row says ML-DSA-65 is in the Node packages and needs Node 24 with OpenSSL 3.5 or later. Still open: the verifier's "no network access" claim needs a code check, and the paper's OPA comparison and "Cutler et al. 2024" citation need checking.
2. **Ship one runnable integration** (done locally). Branch `parmana-trust-verify` in the Microsoft toolkit clone, commit `bc596b0` (DCO sign-off, author as the operator). New community extension `agentmesh-integrations/parmana-trust-verify/`: `verify_record(record, trust_document)` returns a fail-closed verdict using the offline `parmana-verifier` package. Seven tests pass; the example runs; ruff check and format pass with the pinned 0.12.4. The extension does not implement the approval-signature RFC (#4426), which waits on maintainers. Published: branch `parmana-trust-verify` pushed to the fork `pavancharak/agent-governance-toolkit` (head `bc596b0`). PR [microsoft/agent-governance-toolkit#4427](https://github.com/microsoft/agent-governance-toolkit/pull/4427) is open against `main`. It needs a maintainer code owner's approval, and the Microsoft CLA must be signed by the PR author. Not yet watched; add it to the watched threads if the operator asks.

3. **Publish the verifier quickstart** (done on a branch). The verifier's Node quick start already existed. The Python package had none, and every sample record was hybrid (ML-DSA-65), which the Python verifier rejects. Branch `quickstart-python` in `pavancharak/parmana-verifier`, commit `3001baa` (DCO sign-off), pushed. It adds an Ed25519-only sample record, a tampered copy, and a trust set, signed with a fixed test key and labelled as test material. The Python README gains a quick start with a CLI run and a Python snippet, both checked. The verifier's 38 Python tests pass. PR [pavancharak/parmana-verifier#19](https://github.com/pavancharak/parmana-verifier/pull/19), open against `main`. This is the operator's own repo.

4. **Pick targets that accept outside work** (done, sorted by the rules each project wrote down).
   - **Accepts outside PRs, rules clear:**
     - Microsoft Agent Governance Toolkit, `agentmesh-integrations/` only. Core packages are maintainer-only. The extension is PR #4427.
     - Signet (`prismer-ai/signet`). Fork, branch, tests, PR. No issue required. Rust and TypeScript checks.
     - Obsigna (`agent-receipts/obsigna`). PR #1146 is open. Protocol changes need an ADR first.
     - Sigstore (Cosign). Issue optional. DCO, `make test` and `make lint`.
     - Google ADK. Issue first for PRs other than small doc fixes. Requires a Google CLA.
     - Cedar and Casbin. Issue first when in doubt, or for significant changes. Their rules don't mention DCO or AI use.
   - **Issues only, no outside PRs:** OpenAI Agents SDK (`openai-agents-python`) and Codex. An outsider files an issue with a version, a repro, and a sanitized script. Security reports go through `SECURITY.md`.
   - **Gated:** HumanLayer needs a maintainer's `!vouch` before a code PR. NeMo Guardrails needs an assignee before a PR. OPA declined our listing request, so check fit with its maintainers before asking again. MCP changes go through the SEP process.
   - **Unknown:** LangChain (its CONTRIBUTING returned 404), OpenFGA (`openfga/.github` has a CONTRIBUTING.md, but its text did not load), JamJet Policy (no CONTRIBUTING file visible), and withHuman (its GitHub account has no public repos). in-toto has a CONTRIBUTING.md at `doc/source/CONTRIBUTING.md`; its rules are not yet read.
   - **Best next targets:** Signet, because it accepts a PR with no issue required and fits our receipts model. Second, an ADK follow-up on #7569, once the CLA is signed. The Microsoft and Obsigna PRs are already open and need only responses.

   **Signet, first look** (checked 2026-10-26 at `6704117`, nothing posted). Signet's guide asks for fork, branch, tests, `cargo test --workspace`, `cargo clippy -D warnings`, `cargo fmt`, and Conventional Commits. Crypto lives only in `signet-core`, the TypeScript packages wrap WASM, and `unsafe` is banned. The framework integrations we would have proposed already exist: LangChain, CrewAI, AutoGen, Google ADK, LlamaIndex, OpenAI Agents, Pydantic AI, Semantic Kernel, and smolagents. The open TODOs are larger: off-host chain anchoring (L), a TUI dashboard (M), and OAGS conformance (M, waits on the spec). A grep for untested public functions was a false lead: all seven candidates have callers elsewhere in the workspace, so a real gap needs a coverage run. Coverage run done (`cargo llvm-cov --workspace`, pinned nightly, at `6704117`). Five public `signet-core` functions are never entered by the test suite: `constraint.rs` `is_empty`, `receipt.rs` `verified`, `trust.rs` `active_root_entry`, `verify.rs` `with_nonce_checker`, and `verify.rs` `is_agent_trusted`. All five are short. A first PR could add focused tests for them, which the guide requires. Written on branch `test/core-public-functions` in the Signet clone, commit `4ed8688` (Conventional Commit `test(core)`). Checks: `cargo test -p signet-core` passes 372 tests (367 existing plus 5), `cargo fmt --check` and `cargo clippy --all-targets -D warnings` are clean. Pushed to the fork `pavancharak/signet`, branch `test/core-public-functions`, head `4ed8688`. PR [Prismer-AI/signet#12](https://github.com/Prismer-AI/signet/pull/12), open against `main`, from the fork branch. Not yet watched. The patch is in the sandbox scratchpad.

5. **Make trust visible** (done; both PRs open on the operator's own repos).
   - PR [pavancharak/parmana-core#145](https://github.com/pavancharak/parmana-core/pull/145): SECURITY.md "Open security items" section, from `docs/security-status`.
   - PR [pavancharak/parmana-verifier#20](https://github.com/pavancharak/parmana-verifier/pull/20): the Python package in the security scope, from `security-python-scope`.
   - `pavancharak/parmana-core`, branch `docs/security-status`, commit `de557e1`: SECURITY.md gains an "Open security items" section. It lists the two-person control, the third-party check, signed status (G-118), key rotation, and the unscheduled retention job, with a link to the runbook's "Still open" section for owners.
   - `pavancharak/parmana-verifier`, branch `security-python-scope`, commit `743190a` (DCO): SECURITY.md covered only `src/`, so the Python package, which is on PyPI, was out of scope. The scope now covers `python/` too, and the supported-versions table lists the PyPI package, with a note that it cannot check ML-DSA-65 signatures.
   - Still open: whether to publish a full status page, and an outside review. The third-party check is an operator decision.

6. **Follow each project's gate** (checked 2026-10-26, nothing new posted).
   - Microsoft AGT [#4427](https://github.com/microsoft/agent-governance-toolkit/pull/4427): blocked on the Microsoft CLA. The policy bot asks the author to reply `@microsoft-github-policy-service agree`. Only the author can post that, and the CLA checklist box is ticked after signing. Three code owners are required reviewers. The AI review checks show "incomplete; ready for human review." Pipelines may need an authorized maintainer to comment `/azp run`.
   - Obsigna [#1146](https://github.com/agent-receipts/obsigna/pull/1146): no bot actions and no review requests. Fork workflows need maintainer approval before CI runs.
   - Signet [#12](https://github.com/Prismer-AI/signet/pull/12): no review requests and no required bot actions for the code. A Vercel preview on the `willamhou` team needs that team's approval, which doesn't gate the review.
   - Parmana context PR [#143](https://github.com/pavancharak/parmana-core/pull/143): build-and-test was failing on Prettier, fixed in `bf77474`. Vercel deployments are rate-limited for about 24 hours. Merge needs an approving review.
7. **Track responses.** Covered by the hourly watches on the four threads and the three PRs. See "Watched threads."

Item 7 is the watch. Item 5 needs the author's CLA reply on AGT before the review can start.

## Watched threads

Status as of 2026-10-26, 06:56 UTC. Checked by hand at each step. The sandbox could not subscribe to GitHub events for these repos, so an hourly scheduled check re-reads them (trigger `trig_0158KWvcDBv1atbQjfYhDMMd`, first run 07:57 UTC). The check stays silent when nothing changes. It reports new maintainer replies and drafts nothing without approval.

| Thread                                                                                                                     | What we posted or filed                                                                               | Status at last check                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [agent-receipts/obsigna#1146](https://github.com/agent-receipts/obsigna/pull/1146)                                         | Test-vector PR for the Python- and TypeScript-signed receipts                                         | Open. Two commits, no reviews. CI waits for maintainer approval of fork workflows.                                                            |
| [openai/openai-agents-python#5413](https://github.com/openai/openai-agents-python/issues/5413)                             | Offline reproduction comment: a run 1 approval authorizes the same `call_id` in run 2                 | Commented. No maintainer reply seen.                                                                                                          |
| [google/adk-python#7569](https://github.com/google/adk-python/issues/7569)                                                 | Comment proposing a verifiable approval signature alongside the caller-identity check                 | Commented. Assigned to `surajksharma07`. No maintainer reply seen.                                                                            |
| [microsoft/agent-governance-toolkit#4426](https://github.com/microsoft/agent-governance-toolkit/issues/4426)               | RFC: optional detached Ed25519 signature for `ApprovalResolution`                                     | Open, triage. Only the repo's welcome bot has replied.                                                                                        |
| [modelcontextprotocol/modelcontextprotocol#3394](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394) | Not ours. Third-party comment by `silentxtrader` (2026-10-27) reporting TypeScript SDK v2.4.0 results | Unverified. Fixture is in a private repo and CI failed before tests ran. No raw logs. Label any use of these results as contributor-reported. |

## Outside projects: posts and watches

Except where a row says otherwise, no maintainer has replied on any item below. Each comment was posted by the operator, and the operator decides the next step.

- **OPA #9426: closed as not planned.** Maintainer `anderseknert` declined the ecosystem entry. He said a listed project must clearly focus on OPA, and that Parmana's README doesn't mention OPA. He also disputed our claim that OPA cannot produce offline-verifiable records, pointing to its decision-log documentation. Reopen only if Parmana's README and focus change. Do not repeat the offline-verifiability claim in any future post.

| Project                                                              | Item                                                                                                                                | Our post                                                                                                                               | Status                                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vengtoo MCP Gateway (`vengtoo/mcp-gateway`, Apache-2.0)              | [Issue #2](https://github.com/vengtoo/mcp-gateway/issues/2): signed audit records                                                   | Two comments: design (per-record signature, hash chain, checkpoints) and an update (rotatable keys, configurable algorithm, witnesses) | Open, no labels, no assignee, no maintainer reply                                                                                                   |
| OPA (`open-policy-agent/opa`, Apache-2.0)                            | [Issue #9426](https://github.com/open-policy-agent/opa/issues/9426): ecosystem entry and Envoy to OPA to Parmana guide              | Feature request. Maintainer replied (see the note above).                                                                              | Closed as not planned                                                                                                                               |
| NVIDIA NeMo Guardrails (Apache-2.0)                                  | [Issue #2245](https://github.com/NVIDIA-NeMo/Guardrails/issues/2245): external policy-engine example for custom actions             | Offer comment posted by the operator. The page did not show it in the last check: confirm it in the browser                            | Open, "needs triage", no assignee. The issue author (ktirupati) already has an exploratory PolicyAware example and asks to be assigned after triage |
| Model Context Protocol (`modelcontextprotocol/modelcontextprotocol`) | [Issue #3394](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/3394): lost-response retry re-executes tool calls | Comment: single-use authorization with a signed nonce, implemented at the gateway                                                      | Open, no reply visible. Eight comments are hidden behind "Load more"                                                                                |
| Anthropic Claude Code (`anthropics/claude-code`)                     | [Issue #103994](https://github.com/anthropics/claude-code/issues/103994): a PreToolUse hook's `ask` is overridden in bypass mode    | Comment: asks whether `ask` should hold in every permission mode, and offers a repro                                                   | Open, no Anthropic reply. Labels: bug, area:hooks, area:permissions, has repro. Contribution rules not confirmed (CONTRIBUTING returned 404)        |

## Research: candidates checked (nothing posted)

Ranked by overlap with Parmana. "Rules" lists what each project's own files say.

1. **Agent Receipts (`agent-receipts/obsigna`, Apache-2.0, protocol spec MIT, about 20 stars).** The closest match to Parmana's signed receipts and verifier. Rules: no issue required, but larger changes (new cryptographic choices, storage backends, protocol extensions, cross-SDK compatibility) need an ADR in `docs/adr/` first. Conventional Commits. AI agents are first-class contributors under `AGENTS.md`, which bans spec changes without human approval. No DCO, CLA, or AI-disclosure rule found. The repo's `CLAUDE.md` forbids Co-Authored-By trailers, "Generated with" lines, and session links in commits and PRs. Open issues: #1000 and #1001 are the test-only items the PR above addresses. #481 to #485 are protocol and security issues that need an ADR. The ADR set runs 0001 to 0039. Last commit date not shown.
2. **Signet (`prismer-ai/signet`, Apache-2.0 or MIT, 40 stars, 346 commits).** "Cryptographic trust and authorization evidence for AI agents." The closest project to Parmana's own model. Rules: CONTRIBUTING.md exists; fork, branch, tests, PR against `main`; Conventional Commits; `cargo test --workspace`, `cargo clippy -D warnings`, and `cargo fmt` must pass; all public functions need tests; no `unsafe`. No DCO, CLA, or AI-disclosure rule. No open issues, so a contribution would start with a new issue.
3. **JamJet Policy (`jamjet-labs/jamjet-policy`, Apache-2.0, 2 stars, 66 commits).** "The portable policy layer for AI agent actions," with one policy file and one audit trail across a Claude Code hook, an OpenAI guardrail, an MCP shim, Cedar policies, and an `approve` CLI. Direct overlap with Parmana's approval and audit path. No CONTRIBUTING, SECURITY, or DCO file. One open issue, #11 (source-rights evidence gate), and nothing on policy engines or audit signing. Its README says "four adapters" but lists five packages.
4. **withHuman / Agent Approval Protocol.** Calls itself open source with an open spec. The `github.com/withhuman` organization has zero public repositories, and the `withhuman/core` CONTRIBUTING page returned 404. Nothing to contribute to yet. Direct overlap, so it may compete. Recheck before any outreach.
5. **LangGraph (`langchain-ai/langgraph`).** `interrupt()` pauses a graph and resumes with `Command(resume=...)`, which fits an approval step. The docs describe human review, not an automated policy hook. Relevant open issues: #8039 (replay order under `durability="sync"`), #7417 (long tool calls re-executed from checkpoint), #9240 (durability modes do not give exactly-once side effects). CONTRIBUTING returned 404 on both URLs, so rules are unverified.
6. **Witness (`in-toto/go-witness`) and in-toto (`in-toto/in-toto`).** Layouts are signed policy; inspections and predicates are extension points. Witness is the likelier integration point. Rules: an issue is preferred, DCO sign-off, Conventional Commits, tests where possible, maintainer approval. No AI-disclosure rule found. No open issue matches a verifier plugin. The in-toto CONTRIBUTING.md is at `doc/source/CONTRIBUTING.md`; its rules are not yet read.
7. **Sigstore (Cosign, Policy Controller, Rekor).** Cosign already accepts CUE and Rego on in-toto predicates, so an external verdict check overlaps with existing features. Policy-controller has no open issue about external policy engines. Closest open issues: #2005 (matching fields across attestations) and #1891 (source repo metadata checks). Rules, Cosign: DCO sign-off, `make test` and `make lint`, `make docgen` when commands change, and the AI policy in `sigstore/.github` applies. The Rekor CONTRIBUTING page returned 404.

Repo page re-check, 2026-10-26. Read from the GitHub pages, so the counts are approximate. Last-commit dates were not shown on these pages.

- Obsigna: Apache-2.0 code, MIT spec; 20 stars; 30 open issues and 14 open PRs; CONTRIBUTING.md and AGENTS.md present.
- Signet: Apache-2.0 or MIT (dual); 40 stars; 346 commits; CONTRIBUTING.md present.
- JamJet Policy: Apache-2.0; 2 stars; 1 open issue; no CONTRIBUTING, SECURITY, or DCO file in the visible root listing.
- LangGraph: MIT; 43.9k stars; 351 open issues; the contributing guide is external (docs.langchain.com).
- go-witness: Apache-2.0; 54 stars; 30 open issues; CONTRIBUTING.md present.
- Sigstore cosign: Apache-2.0; 6.4k stars; CONTRIBUTING.md present. Policy-controller: license name not shown; 182 stars; 65 open issues.
- HumanLayer: Apache-2.0 (some vendored MIT); 12.6k stars; 35 open issues; CONTRIBUTING.md present.

Not confirmed: MCPGuard (the name matches several projects; the closest is `loplop-h/mcpguard`, MIT, 0 stars, very new, not reviewed in depth), awaithumans (third-party directories only: Apache-2.0, about 24 stars; the GitHub repo and maintainers are unconfirmed), and raucle (PyPI and vendor blog only; no repository found). HumanLayer has a fork and PyPI releases 0.5.7 to 0.5.11rc1. OpenBox (reference repo returned 404). Anthropic Agent SDK (CONTRIBUTING returned 404).

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

- [#4363](https://github.com/microsoft/agent-governance-toolkit/issues/4363): approval requests do not say which tool or action they approve. ADR-0030 already answers this with `ActionBinding` and `action_digest`, which are implemented in `approval_protocol/binding.py`. Probably resolved; do not comment on it.
- [#4298](https://github.com/microsoft/agent-governance-toolkit/issues/4298): an optional example-only governance substrate. Its "shutdown receipts" are not signed. Community-authored, awaiting maintainer triage.
- [#4217](https://github.com/microsoft/agent-governance-toolkit/issues/4217): external authority admission across federated runtimes.
- [#4374](https://github.com/microsoft/agent-governance-toolkit/issues/4374) and [#4375](https://github.com/microsoft/agent-governance-toolkit/issues/4375): a Cedar dispatcher and docs.
- No issue names receipts or cryptographic signatures directly.

ADR-0030 (accepted, 2026-06-11) makes the approval hash chain mandatory and names detached Ed25519 signatures or externally anchored receipts as optional extensions. The Python and .NET implementations have no signatures. That optional extension is the right target for Parmana.

Posted: [microsoft/agent-governance-toolkit#4426](https://github.com/microsoft/agent-governance-toolkit/issues/4426), "RFC: Optional detached Ed25519 signature for ApprovalResolution (ADR-0030 optional extension)". Opened 2026-10-26 under the RFC template, labelled triage. Only the repo's welcome bot has commented so far. No maintainer has responded.

Next: wait for a maintainer decision on placement (core versus `agentmesh-integrations/`) and on the signing scope. Build any code only after they respond, and do not open a PR without maintainer approval. Core changes need maintainer approval.

## Google (`google/adk-python`, `google-agentic-commerce/AP2`)

Research only, nothing posted. Checked 2026-10-26.

- **Best fit: ADK issue [#7569](https://github.com/google/adk-python/issues/7569)**, "HITL tool confirmation forgery is still present." Any caller that can send a function response can send `confirmed: true` for a pending confirmation and run the gated tool. A fix (#6462, commit `9e9eaa6`) was reverted (`9a32eba`), so the issue is open on `main` and 2.12.0. Its proposed fix, PR #7134, adds a `CallerPrincipal` checked against the A2A caller, and refused approvals become `confirmed=False`. Strict refusal sits behind `ADK_ENABLE_STRICT_CALLER_PRINCIPAL`, and the default only warns, so forged approvals would still be accepted by default. No signed or verified confirmation is proposed. That is the gap Parmana's signed approvals could fill.
- **Related open issues:** #7655 (the delete-files confirmation is controlled by a model-supplied argument), #7520 (pre-execution tool validation as a `before_tool_callback` recipe, a policy-check feature request), #7575 (proxies rejecting client-controlled request fields), #7684 and #7685 (confirmation handling for parallel and multi-confirmation workflows).
- **ADK contribution rules (`CONTRIBUTING.md`):** a Google CLA is required. Issues come first for all PRs except small doc fixes, and substantial features need a design issue. Unit tests go in `tests/unittests/`, `tox` must pass on all supported Python versions, and `pre-commit run --all-files` applies. ADK is mirrored from an internal repo with Copybara, so accepted PRs may show as closed rather than merged. AI rules: not stated.
- **AP2 (`google-agentic-commerce/AP2`):** the core specification moved to FIDO, so the repo accepts contributions only for samples and the SDK. It requires a CLA. Its signed mandates (Intent, Cart, Payment) are a close fit for Parmana's signed records, and it has a verifier that issues receipts. Rules on issues and AI use are not stated.
- **Posted:** a comment on #7569 proposing a verifiable approval signature alongside the caller-identity check. It notes that ADK already binds name and arguments through session history, and that the live path (`live/_live_llm_flow.py`) is not yet covered. Checked against ADK at `bf67397`. The issue is assigned to `surajksharma07`, and the linked development item is the caller-principal fix. No maintainer reply yet, as of this check. The comment was not checked on the page beyond the author's view.

## More candidates (checked 2026-10-26, nothing posted)

- **HumanLayer (`humanlayer/humanlayer`, Apache-2.0).** Approval API and SDK for agents. The `@hl.require_approval()` decorator gates a tool function, and approvals route to Slack, email, or other channels. Python and TypeScript. Overlaps with Parmana's approval step. Contribution rules: code PRs need a maintainer's `!vouch` first, through a design-first proposal issue. Bug reports and feedback are open to anyone. Use `bun` only, and CI runs without secrets. No CLA, DCO, or AI-disclosure rule. Requests that need a real API key won't pass CI.
- **OpenFGA (`openfga/openfga`).** Its CONTRIBUTING defers to the main guide in `openfga/.github`, which has a CONTRIBUTING.md, but its text did not load from here. Testing rules are listed in the file. The closest open item is #3023, "Log the decision": an enhancement request for an audit record of why an authorization decision was made. Opened March 29, 2026; still open as of 2026-10-26. Its only comment (September 14, 2026, by xHarrowingx) describes that user's own product. The page does not show whether they are a maintainer. No mention of signed decisions.
- **Still unchecked or unconfirmed:** MCPGuard, awaithumans (no results), raucle (no repository found).

## OpenAI (`openai/openai-agents-python`, `openai/codex`)

Reproduction of #5413, run 2026-10-26 on `main` at `0dc4cf1`. Offline, `ScriptedModel`, no API key. The script lives in the sandbox scratchpad (`repro_5413.py`), not in this repo. Output:

- `after run 1: ['A']`
- `run 2 interruptions before stale approve: 1`
- `after run 2: ['A', 'A']`

So the approval from run 1 authorized the same `call_id` in run 2, and the tool ran with no decision in run 2. Posted as a comment on [openai/openai-agents-python#5413](https://github.com/openai/openai-agents-python/issues/5413), 2026-10-26. Five other comments were on the issue before it. No maintainer has replied yet.

Research only, nothing posted. Checked 2026-10-26.

- **Agents SDK fit:** the SDK has tool guardrails and human-in-the-loop approvals. A tool marked `needsApproval` pauses the run, and the caller resumes it with the decision. Per a third-party write-up, tool guardrails do not cover handoffs or hosted tools. That's unverified, so check the official docs first.
- **Open issues closest to Parmana:**
  - #5409: an approved tool can run again if the process stops after it runs but before its state is saved. This is the replay problem that ADR-0030's approval binding addresses.
  - #5413: an approval can carry over to another run when a call ID is reused. This is the binding problem.
  - #5407: a payment guardrail proposal with external spend authority and auditable receipts. Closest to Parmana's receipts.
  - #5408: pre-execution guardrails for agent loops (enhancement).
  - #5353: "Support the OpenAI Decisions API." Unclear; read it before relying on it.
- **Contribution rules (`openai-agents-python`, `CONTRIBUTING.md`):** only repository collaborators open PRs. Outsiders must open an issue, including for docs or examples. An issue needs the affected version, expected and actual behavior, and a small sanitized reproduction. Security reports go through `SECURITY.md`. Setup uses Python 3.10+, `uv`, and `make sync`. No DCO, CLA, or AI rule stated.
- **Codex:** does not accept external code contributions. Issues only, with the Codex team making code changes.
- **Implication:** a useful contribution to the Agents SDK is an issue with a reproduction, not a PR. The strongest candidate is a reproduction for #5409 or #5413 that shows what a binding check would catch. That needs approval before anything is posted.

## LangChain (`langchain-ai/langchain`)

Research only, nothing posted. Checked 2026-10-26.

- **Fit:** LangChain has a built-in human-in-the-loop middleware that pauses before a tool runs. Per-tool rules decide which calls need review, and a reviewer can approve, edit, or reject. Resuming uses `Command`, and pausing needs a checkpointer and a thread ID. A deterministic pre-execution policy hook is the gap.
- **Closed proposals on that gap:** #41231 and #41234 proposed a pre-execution tool-call guard with operator-declared policy, plus a test. Both were closed as not planned by the automated triage bot `langchain-oss-automated-triage`. The bot said the issues "appear to have been submitted programmatically" because they had no issue type, and that "We do not allow automated issue submission at this time." No maintainer read the proposal. The author, PHM-Audit, says the filing was made through the API, which cannot set an issue type. #41233 was a duplicate of #41234.
- **Lesson:** file any LangChain issue through the web UI and set the issue type yourself. Ask a maintainer to reopen the closed items, rather than filing a duplicate.
- **Open items nearby:** #41051 (`@wrap_tool_call` loses custom context type, which affects middleware that gates tools).
- **Contribution rules:** `CONTRIBUTING.md` returned 404 at both the `.github/` and root paths. Rules are unverified.

## Contribution rules learned so far

- **NeMo Guardrails:** an issue must come first, and the contributor must be assigned to it before opening a PR. DCO sign-off is required. Disclose AI assistance in the PR description.
- **OPA:** feature requests start as an issue. Every commit needs a human sign-off. AI may help write code, but issue text, PR descriptions, and replies must be written by a human. Reviewers reject AI-generated replies.
- **MCP:** spec changes follow the SEP process: discuss with a working group, build a prototype, then write the SEP. AI assistance must be disclosed.
- **Sigstore:** issue first, DCO sign-off, updated docs, passing CI, maintainer review.
- **OPA:** a maintainer declined a listed-project entry because the project must focus on OPA. Check fit with the maintainers before asking for listings.
- **Casbin:** issue first for significant PRs. No DCO, test, or AI rules in the excerpt read. Its open issues show no MCP, agent, or signed-decision topic. The Casbin blog's MCP work is not visible in the tracker.
- **Cedar:** issue first when in doubt. RFC process for substantial features. No DCO or AI rule stated. PRs target `main`. Conduct: CNCF Code of Conduct.
- **OpenFGA:** `openfga/.github` has a CONTRIBUTING.md, but its text did not load, so the rules are not yet read. Closest open item to an audit feature is #3023, "Log the decision" (enhancement).
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

# Zerodha Kite Connect connector: working context

Last updated 2026-10-26. This file is for resuming the work later. Update it
when a PR opens or merges, or when a blocker changes.

## Status at a glance

- Merged: the passive package skeleton (PR #155, on `main` since 15:04 UTC).
- Written, not committed: the paper-mode order client `PaperKiteClient`.
- Not started: the gateway adapter, and everything needed for live trading.
- Live trading is blocked. It must not be enabled until the two approvals below
  are confirmed.

## What is completed

### 1. Passive package skeleton (merged, PR #155)

Package `@parmana/connector-zerodha` at `packages/connector-zerodha/`.

- `src/ZerodhaCapabilities.ts`: capability `zerodha:place-order`, the API base
  URL, the login URL, and the API version `3`. Declared only. No execution.
- `src/ZerodhaMetadata.ts`: connector metadata. Description says it is passive
  and places no orders.
- `src/KiteSession.ts`: pure helpers.
  - `kiteLoginUrl(apiKey)` builds the login URL.
  - `kiteChecksum(apiKey, requestToken, apiSecret)` returns SHA-256 hex of
    `apiKey + requestToken + apiSecret`, the checksum Kite requires for the
    request-token exchange.
  - `kiteAuthorizationHeader(apiKey, accessToken)` returns
    `token api_key:access_token`.
- `tests/unit/kite-session.test.ts`: 8 tests.

Merged commit `cd86b7e` is not GPG-signed, so it shows as Unverified on `main`.
A decision was made to leave it (option 1). Re-signing would rewrite `main`.

### 2. CodeQL alert on PR #155 (dismissed)

CodeQL reported "Use of password hash with insufficient computational
effort" (High) at `KiteSession.ts` around line 34. It is a false positive.
Kite's checksum is a required request signature, not password storage. A
slower hash would break the login. The alert was dismissed by the operator as
a false positive. Do not change the algorithm to satisfy the scanner.

### 3. Paper-mode order client (written, NOT committed)

Files:

- `src/PaperKiteClient.ts`: `PaperKiteClient.placeOrder(request)` validates an
  order in Kite v3 shape and records it with a simulated id (`PAPER-000001`).
  It has no network calls and sends nothing to a broker.
  - Validation: non-empty `tradingsymbol`; exchange in NSE, BSE, NFO, CDS, MCX;
    `transactionType` BUY or SELL; `quantity` a positive integer; `orderType`
    MARKET, LIMIT, SL, or SL-M; `product` CNC, MIS, or NRML; `variety` must be
    `regular` if given; LIMIT and SL need a positive `price`; SL and SL-M need a
    positive `triggerPrice`.
  - `orders()` returns a copy of the recorded orders, oldest first.
  - Failed validation records nothing.
- `tests/unit/paper-kite-client.test.ts`: 9 tests.
- `src/index.ts`: exports the client, its error, and its types.

Verified in the sandbox: `vitest run` 17 of 17 pass; `tsc --noEmit` clean;
Prettier check clean.

Patch for the commit: `zerodha-paper-mock.patch` (sent to the operator). It is
against `main` at `1572638`.

## What is left

In order:

1. **Commit and push the paper-mode client.** Run on the operator's Windows
   machine, because the sandbox can't pass the gitleaks scan. The remote branch
   `feat/connector-zerodha-paper-mock` currently points at `45dbc0b`, an empty
   commit that predates `main`. Overwrite it with `--force-with-lease`. See the
   commands in the chat. If the patch is lost, regenerate it from this branch.
2. **Open the PR** against `main` once the push succeeds. The operator asked
   for it, so it is allowed. Use `.github/PULL_REQUEST_TEMPLATE.md`. Do not
   name a model in the PR. A "Generated with Claude Code" footer is allowed.
3. **Gateway adapter (not started).** Connect the connector to Parmana's
   execution gateway. Live release must stay disabled. Before writing it, read
   `packages/execution-gateway/src/ExecutionGateway.ts` (`verify`, `execute`)
   and the connector SDK interfaces. Earlier reading showed `execute()` calls
   `verify()` first, then releases through `executionControl` or the connector.
   That still needs confirming in code.
4. **Live path (blocked).** Not to be started until the approvals below are
   confirmed.

## Why it is built this way

- **Passive first.** A connector that places no orders and makes no network
  calls can be reviewed and tested without regulatory or broker approval. Each
  later step gets its own PR and review.
- **Placement is not execution.** A placed order can still fail, be rejected,
  or be partially filled. The gateway's verify-then-release model and its
  EXECUTION_OUTCOME_UNKNOWN handling must be respected in the adapter.
- **Paper mode first.** It lets the whole order flow run end to end, so the
  adapter can be tested before anything can reach a broker.

## Requirements before any live use

These are not met yet. Confirm each one, and record the answer here.

1. **SEBI retail algo-trading rules.** Circular No.
   SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013, dated Feb 4, 2025 per the
   sebi.gov.in page. Only secondary sources have been read for the body, and
   those sources give conflicting dates. Read the circular itself and get
   compliance or legal sign-off on whether our setup qualifies.
2. **Zerodha Kite Connect approval.** A registered Kite Connect app with an
   `api_key` and `api_secret`, and confirmation that our use case is allowed.
   Check the current developer terms.
3. **Secrets handling.** `api_key` and `api_secret` are never committed, never
   pasted into chat, and never put in the repo. Keep them in a password manager
   or environment variables. The repo is public. Treat any key that appeared in
   chat as exposed and rotate it.

## Kite API facts used in this design

Checked from the public Kite Connect v3 docs, to re-verify before live work:

- Login URL: `https://kite.zerodha.com/connect/login?v=3&api_key=...`
- Request-token exchange: POST `/session/token` with the checksum, and header
  `X-Kite-Version: 3`.
- Authorization header: `Authorization: token api_key:access_token`.
- Access tokens expire at 6 AM the next day. Refresh is only for approved
  platforms, so plan a daily login.
- Order placement: POST `/orders/:variety`.
- Rate limits: orders 10 per second, 400 per minute, 5000 per day.

## How to work on this

```bash
cd packages/connector-zerodha
npx vitest run                     # unit tests
npx tsc --noEmit -p tsconfig.json  # typecheck
cd ../.. && npx prettier --check packages/connector-zerodha/src packages/connector-zerodha/tests
```

Environment notes:

- The repo says Node 24 is required for Parmana. The sandbox has Node 22, and
  the Zerodha package tests run on it.
- The pre-commit hook runs gitleaks. Neither gitleaks nor a running Docker
  daemon is available in the sandbox. Commit on the operator's machine. Do not
  use `--no-verify`.
- Commits use `git commit -s` (DCO sign-off). Do not name a model in commits or
  PR text.

## Decisions still open

- Whether to re-sign `cd86b7e` (decided: leave it).
- Whether to dismiss or fix any future CodeQL alert of the same kind. The
  current policy is to dismiss a false positive with a written reason.
- Who approves PRs for this package. The repo requires an approval from
  someone other than the last pusher.

## Update: live path built, kept off

The decision is to build the whole connector and keep live trading off until the approvals below are recorded. Nothing is enabled, and nothing is registered with the gateway.

- Built: `KiteLiveClient` (HTTPS only, no retries, unknown-outcome errors, no secrets in messages) and `GatewayZerodhaAdapter` with paper and live modes.
- Live mode refuses to construct unless a `ZerodhaLiveApproval` with `sebiCircularReviewRef`, `kiteApiApprovalRef`, and `approvedBy` is supplied. No such record exists in the repository.
- Paper mode is refused in production.
- Still open: the SEBI circular check, Zerodha's API approval, and the Kite facts marked for re-verification in `src/KiteLiveClient.ts`. See `README.md` for the full list before enabling anything.

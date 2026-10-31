# Tutorial 128 — NBFC Loan Disbursement

## Objective

Show how the `nbfc-loan-disbursement` 1.0.0 policy decides a loan disbursement: which conditions must hold, which named refusal each one produces, and how a rolling velocity limit stops a run even when every transfer is approved.

## What You'll Learn

- A disbursement is approved only when all six conditions hold: a verified human approval, an approved loan account, a beneficiary recorded on that loan, an amount within the per-transaction limit, a lender within its rolling velocity limit, and an amount greater than zero.
- Each condition that fails produces a named refusal, except a missing human approval, which currently falls to the policy's generic default refusal.
- A velocity limit caps a run. With approvals present for every transfer, only as many transfers as the window allows are approved.

## Running the Tutorial

```bash
npx tsx examples/tutorials/128-nbfc-loan-disbursement/run.ts
```

The run prints a PASS or FAIL for each check and exits with an error if any check fails.

## What This Tutorial Does Not Show

This tutorial supplies the four facts other than `humanApproved` itself (`loanAccountApproved`, `beneficiaryAllowed`, `withinDisbursementLimit`, `withinAggregateVelocityLimit`). Those are the values a real request must not be allowed to choose.

The live policy does not yet declare `signalSources` for them. Until it does, a request's own values for those facts are what the policy evaluates. This tutorial demonstrates the decision logic, not that those facts are trustworthy. Version 1.1.0 of the policy is planned to declare the sources that establish them, as described in the policy's approval record and the connect-a-business-signal-source guide.

## Why This Matters

A per-transaction cap alone allows a pattern of many transfers, each below the cap. The velocity limit and the loan and beneficiary checks are what stop that pattern. The policy enforces them only once the facts behind them come from a source the caller cannot set.

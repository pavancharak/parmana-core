# Reviewing Parmana

A brief for a second reviewer: someone other than the author who approves pull requests and, once,
reviews the security-critical code in depth. Parmana authorizes and records what AI agents do, so a
change nobody else read is a change nobody else checked.

## Before you start

- **Agreement.** The repository is source-available for evaluation only ([LICENSE](../LICENSE)).
  Reviewing it as a collaborator needs a written agreement with Parmana Systems, as described in
  [CONTRIBUTING.md](../CONTRIBUTING.md).
- **Access.** Write access to `pavancharak/parmana`, so your approval counts toward the branch rule on
  `main`. You do not need, and should not receive, production keys, database credentials or vendor
  credentials. Everything below runs on a local copy.
- **Setup.** Node 24 (`node -v`), then `npm ci`, `npm run build`, `npm test`. ML-DSA-65 tests skip on
  older Node.
- **Read first, about an hour.** [docs/site/how-parmana-thinks.mdx](site/how-parmana-thinks.mdx),
  [THREAT-MODEL.md](../THREAT-MODEL.md), and the "Open issues at a glance" table in
  [VERIFICATION-GAPS.md](VERIFICATION-GAPS.md).

## Reviewing a pull request

Approve only what you have checked. For each pull request:

1. **What does it claim?** The description says what changed and why. A change to behavior names the
   claim in [CLAIMS.md](CLAIMS.md) it affects, or the gap (G-xx) it closes.
2. **Does a test prove it?** A fix adds a test that fails without it; the description should say so.
   For a security fix, check that claim yourself: revert the source change locally and run the test.
3. **Does it fail closed?** Every new path that can refuse must refuse when an input is missing,
   malformed, expired or unknown. Look for `catch` blocks that continue, defaults that allow, and
   optional fields treated as present.
4. **Are the records still complete?** An action that runs needs a signed Execution Trust Record; a
   refusal needs a signed Refusal Record. A change must not add a path that does either silently.
5. **Do the docs match?** CLAIMS.md, VERIFICATION-GAPS.md and the docs site say what the code does,
   no more. Overstated docs are a defect.
6. **CI.** Green on the latest commit, including CodeQL and dependency review.

Request changes when any answer is no. Comment "not checked" on anything you did not check rather
than approving it silently.

## The deep review, once

Go through the code that decides whether an action runs, in this order. Budget one to two days.

| Order | Where                                              | The question                                                                                                   |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1     | `packages/envelope-verifier/src`                   | Can a release go through without a valid, unexpired, single use authorization for exactly this request?        |
| 2     | `packages/execution-gateway/src`                   | Does the gateway re-verify before every release, hold every credential, and forward only listed parameters?    |
| 3     | `packages/approval/src`                            | Can an action that needs a person's approval run with a missing, expired, reused or out of scope approval?     |
| 4     | `packages/policy/src`                              | Does no matching rule always refuse? Can a malformed policy or signal approve anything?                        |
| 5     | `packages/crypto/src`                              | Do signing and offline verification cover every field they claim to? Can a record be changed and still pass?   |
| 6     | `packages/api/src/auth`, `packages/api/src/routes` | Can a caller act outside its key's actions, or change a policy, approver or connector without a second person? |
| 7     | `packages/runtime/src`                             | Is every request shape checked before use?                                                                     |

Useful tools on the way:

- `npm run evaluate` runs the attack scenarios; `npm run evaluate -- EV-04` runs one.
- [MUTATION-TESTING.md](MUTATION-TESTING.md) lists the mutants that survived and why; a surviving
  mutant in the code above is worth a look.
- [SECURITY-CHALLENGE.md](../SECURITY-CHALLENGE.md) lists what counts as a break.

## Reporting what you find

- **A vulnerability:** privately, through
  [a security advisory draft](https://github.com/pavancharak/parmana/security/advisories/new) or
  founder@parmanasystems.com, never in a public issue or comment ([SECURITY.md](../SECURITY.md)).
- **Anything else:** a GitHub issue, or a comment on the pull request. Name the file and line, the
  input, what happens, and what should happen.
- **The deep review:** one written summary. What you covered, what you did not, each finding with its
  severity, and which claims in CLAIMS.md you would weaken or remove. It is recorded in
  VERIFICATION-GAPS.md with your permission, and you are credited by name if you want to be.

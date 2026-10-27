# AWS Agent Toolkit Rules

## AWS MCP Server Usage

- Prefer the AWS MCP Server for AWS interactions when available. It provides sandboxed execution, observability, and audit logging.
- If the MCP server is unavailable, use the AWS CLI directly.
- Always check that the AWS MCP Server is properly configured with the `parmana` profile before making AWS API calls.

## Skill Discovery & Loading

- Before starting any AWS task, check whether a relevant AWS skill is available by using `retrieve_skill`.
- Load the appropriate skill based on the task (e.g., amazon-bedrock for LLMs, aws-security for security tasks, aws-storage for S3).
- Prefer skill guidance over general knowledge when working with AWS services.
- If uncertain about AWS-specific details, verify against official documentation rather than guessing.

## Infrastructure as Code

- When creating AWS infrastructure, prefer infrastructure-as-code (AWS CDK or CloudFormation) over direct CLI commands.
- Use TypeScript/Node.js for CDK when possible to match your project's language.
- Store infrastructure code in version control alongside application code.

## AWS Well-Architected Framework

- Follow AWS Well-Architected Framework principles when designing infrastructure:
  - Operational Excellence: automate deployments, monitor systems
  - Security: principle of least privilege, encrypt data at rest and in transit
  - Reliability: design for failure, implement health checks
  - Performance Efficiency: right-size resources, use caching
  - Cost Optimization: monitor spending, use serverless where appropriate

## Secret & Credential Safety

- MUST load the aws-secrets-manager skill first for any secret, credential, API key, token, or password task.
- Do NOT call secretsmanager get-secret-value directly.
- Use AWS Secrets Manager for all credentials and sensitive data.
- Configure the parmana AWS CLI profile with proper credential isolation.
- Never commit credentials, API keys, or secrets to version control.

## Region & Profile Consistency

- Default region: ap-south-1 (Mumbai) unless project specifies otherwise.
- Default profile: parmana (configured via AWS MCP Server).
- Always specify region and profile in CLI commands to avoid unintended cross-region operations.

## Documentation & Verification

- When uncertain about API parameters, permissions limits, or error codes, verify against official AWS documentation.
- State uncertainty explicitly if you cannot confirm a detail.

## Project-Specific Context

- Repository: github.com/pavancharak/parmana (PUBLIC - no secrets)
- AWS Account: 013659367671 (parmana profile)
- AWS Region: ap-south-1 (Mumbai)
- Primary Language: TypeScript/Node.js
- Deployment Target: Vercel (production is Vercel only)

## Best Practices for This Project

- Use TypeScript strict mode for type safety
- Leverage Parmana's authorization layer for agent execution verification
- Test AWS integrations locally before deploying to production
- Use environment variables for configuration (see .env.example)
- Implement proper error handling for AWS API calls
- Monitor CloudWatch logs for production deployments

## Open-source contribution context

Before continuing open-source contribution work in this repo, read
`docs/OPEN-SOURCE-WORK.md`. It records the merged PRs, the outside
projects being followed, and the working rules (Node 24, sign-off on
commits, no model names in commits, and PRs or watching only when asked).

# Lessons: mistakes we will not repeat

Read this before any git, PR, migration or docs work in parmana or parmana-core.

## Repos and branches

- Know the repo before any command. `parmana` and `parmana-core` are different repos with different history. Check `git remote get-url origin` first. Never push a change to the wrong repo.
- Create a new branch from `origin/main` before editing. Do not switch branches with uncommitted work in place. Commit, stash with a label, or ask first.
- Before a commit or push, run `git status --short` and list every file. If a file is not part of the change, stop and ask.
- Before a PR, check whether the branch is already merged on GitHub. Do not assume.

## Verifying state

- Do not say something is merged, pushed, or applied until it is confirmed: a fetch, a `git log`, or the user's own report.
- Do not repeat the same failing command more than once without a change. Report the blocker and ask.
- When a CI check fails, get the failing step name and its log before proposing a fix. If the log is unavailable, reproduce the same steps locally.

## Commits, sign-off and identity

- The DCO check needs a sign-off that matches the commit author. Commits authored as an AI identity fail it. The human who submits the change must be the author and the signer.
- Do not use `--no-verify`. Fix the failing check instead.
- Do not commit generated output from a build or test run unless the change requires it.

## Pre-commit checks (run in this order before committing)

1. `npm run build` (stale `dist/` fails the preflight).
2. `npx prettier --write` on the changed files.
3. `npx eslint` on changed TypeScript files.
4. Confirm Docker and the local Postgres are running if the preflight needs them.
5. Commit only after `git status` shows just the intended files.

## Generated files

- After changing docs, migrations or the gap register, regenerate what is generated: `npm run generate:migration-bundle`, `npm run generate:llms-txt`, `npx tsx scripts/gap-status.ts`, `npm run generate:build-book-reference`. Tests check them.
- A stale generated file fails tests even when the code is right.

## Gap numbers and docs

- Before adding a gap entry, search the register for the next free number. G-119 was already in use in parmana-core and had to be renamed to G-125.
- Put the `Status:` sentence in the first paragraph of each gap entry. The generator reads only that paragraph.
- Docs must describe real behaviour. Check the error handler and the tests before writing "returns 409".

## Patches and transfers

- Generate patches with `git format-patch` from a commit, not `git diff` of a dirty tree.
- Before a patch is applied to another repo, check that repo's `main` matches the base and that the file paths exist there. A patch can apply to one repo and fail in another.
- Confirm that a file reached the user's machine (check the download folder) before asking them to apply it.

## Migrations and secrets

- Apply migrations before deploying code that uses the new table. Verify with `to_regclass`.
- Never paste a database password or full connection string into chat. If one is pasted, rotate it at once and say so.
- Use placeholders only in examples, and tell the user to replace them. Do not run a command that still contains a placeholder.

## Test changes

- When a test's expectation changes, make the check stricter, not looser. A replay check must accept only a recorded result or a known replay error code, never any error.
- Keep the error code in the assertion. A test that passes for any thrown error hides real failures.

## Scope and questions

- When a request is ambiguous ("g12 fix"), state the reading you chose and confirm it before doing work that is hard to undo.
- When a choice needs a human decision (approval, authorship, force-push, resetting a branch), ask. Do not decide it.
- When a step is blocked by a tool or permission problem, say so plainly and name the next step. Do not keep retrying.

## Communication

- Keep updates short. Give one next action, not a list of alternatives, unless a choice is needed.
- When a command fails, quote the exact error and the step name, then say what is known.

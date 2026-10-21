# Local development runbook

How to set up the repository on a Windows machine, build it, typecheck it, run the tests, and fix the failures we hit. Every command here is in `package.json`, and every fix matches an error we saw.

**Read first:** [README.md](README.md) for the rules that apply to every runbook.

---

## 1. Requirements

- **Node.js 24 or later.** `package.json` declares `"engines": { "node": ">=24" }`. We used 24.18.
- **npm**, from the same Node install.
- **PowerShell** for the commands below. They use Windows paths.

Check the version:
```powershell
node --version
```

---

## 2. Install

From the repository root:
```powershell
npm install
```

Run `npm install` again after you pull a branch that changes `package.json` or `package-lock.json`.

---

## 3. Build

```powershell
npm run build
```

This runs three steps in order (see `package.json`):

| Step | What it does | What it changes |
|---|---|---|
| `npm run openapi` | Lints the OpenAPI spec, bundles it, adds code samples, and generates the Postman collection | `openapi/openapi.bundled.yaml`, a copy under `docs/site/`, and the Postman collection |
| `tsc -b` | Compiles every TypeScript project | Compiled output under each package's `dist` folder |
| `npm run build --workspace=typescript` | Builds the TypeScript SDK | The SDK's output |

**The build rewrites generated files.** After a build, run `git status`. If generated files changed and you did not mean to change them, do not commit them with your change. Commit them separately, or discard them.

**Why the build matters for production:** the Vercel entry point `api/index.ts` imports the compiled `packages/api/dist` output, not the source. A change to `packages/api/src` reaches Vercel only after the build produces new `dist` output. If you change the source and skip the build, production runs the old code.

---

## 4. Typecheck

```powershell
npm run typecheck
```

This runs `tsc --noEmit` over the project. A clean run prints nothing and exits with 0. Any error prints the file and line.

Run it before you open a PR. The vitest run does not type-check, so a test can pass with a type error still in the code.

---

## 5. Test

Full suite:
```powershell
npx vitest run
```

Expect every test file to pass. The last full run passed 348 test files and 3,776 tests, with 140 skipped.

Targeted:
```powershell
npx vitest run packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts
npx vitest run tests/architecture/vercel-entry-policy-checkers.test.ts
```

One test by name:
```powershell
npx vitest run packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts -t "refuses a rejection from a checker"
```

Watch mode while you edit: `npm run test:watch`.

**Test mode:** tests set `NODE_ENV=test`. In that mode the stores are in memory (for example `createPolicyChangeStepUpNonceStore` returns `MemoryNonceStore`) and the production key checks are off. A test that passes locally may still fail in production for that reason. The governance tests in `pending-policy-changes-governance.integration.test.ts` are the reference for the step-up path.

**Tests that share state:** two tests that propose a change to the same policy name can interfere, because the second proposal reads the first one's record. Give each test its own policy name.

---

## 6. Lint

```powershell
npm run lint
```

Use `npm run lint:fix` to fix what the linter can fix automatically. Review the diff afterwards.

---

## 7. Run a script that imports a workspace package

Scripts run with `tsx` (`npx tsx <file>`) and import packages by their workspace paths. Two errors come up often.

**`ERR_PACKAGE_PATH_NOT_EXPORTED ... @parmana/crypto`**

The workspace packages are not built, so their `exports` entries do not exist yet. Build first (section 3), then run the script again.

**Only importing `ConfigValidation.ts` does not need a build.** The check below imports a single source file, and it runs without a build:
```powershell
$env:KEYS = [System.IO.File]::ReadAllText('<folder>\PARMANA_API_KEYS.json')
npx tsx -e "import { parseApiKeys } from './packages/shared/src/config/ConfigValidation.ts'; console.log('OK', parseApiKeys(process.env.KEYS).map(e => e.callerId))"
```

Pass values through an environment variable, not as command-line arguments. PowerShell and Node handle quotes differently, and a key with special characters can break in argument form.

---

## 8. Generated and secret files

- `.env` files are for local use only. Do not commit them. Check `.gitignore` before adding a file under the repository root.
- Keys and PEM files live outside the repository, in a folder you name. Never create one inside the repository.
- The generator scripts print keys and private keys to the screen once. Capture the output into a variable, save it, then clear the variable (see [KEY-ROTATION.md](KEY-ROTATION.md), section 2).

---

## 9. When a build or test fails

| Symptom | Likely cause | Fix |
|---|---|---|
| `ERR_PACKAGE_PATH_NOT_EXPORTED` | Packages not built | `npm run build` |
| Build rewrote files you did not touch | The OpenAPI and docs steps regenerate files | Check `git status`. Do not commit generated changes with an unrelated change. |
| Typecheck passes, a test fails with an import error | A stale `dist` folder | `npm run build`, then the test |
| Test passes alone and fails in the full run | Two tests share a policy name or a store | Give each test its own name |
| Node version error | Node older than 24 | Install Node 24 or later |
| A production behavior differs from a test | Tests run with `NODE_ENV=test` | Check the production gates in [PRODUCTION-ENVIRONMENT.md](PRODUCTION-ENVIRONMENT.md) |

---

## 10. Before you open a PR

Run in this order, and record the result in the PR checklist:
```powershell
npm run typecheck
npx vitest run
npm run build
git status
```

The build step is the one that is easiest to skip. If you cannot run it, say so in the PR. A green typecheck and test run does not show that the build works.

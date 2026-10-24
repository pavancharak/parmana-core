# Sandbox playground scripts

The scripts shown on the docs Playground page (`docs/site/playground.mdx`). Each runs the same seven steps against the
public sandbox, `https://parmana-sandbox.vercel.app`, with the published demo key: who am I, the policy in effect, a
refusal with no approval, a demo approval, an approved and signed release, an offline check of the signed record, and
a refusal of the reused approval.

| File             | Needs                                                                 | Run                                                       |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `playground.sh`  | bash, curl (`uuidgen` optional: Python's `uuid` is the fallback)      | `bash playground.sh`                                      |
| `playground.ps1` | Windows PowerShell 5.1 or later                                       | `powershell -ExecutionPolicy Bypass -File playground.ps1` |
| `playground.ts`  | `npm install @parmana/sdk tsx`, `PARMANA_API_KEY` set to the demo key | `npx tsx playground.ts`                                   |
| `playground.py`  | `pip install "parmana[verify]" requests`, `PARMANA_API_KEY` set       | `python playground.py`                                    |

They are not part of `npm run examples`, because they call a live server. Run them against the sandbox after changing
one, then keep the page equal to the files: `tests/architecture/sandbox-playground.test.ts` fails if they differ. The
Python script verifies the record as raw JSON because of `docs/VERIFICATION-GAPS.md` G-85.

## Tested against the live sandbox

Each row is one full run of the seven steps against `https://parmana-sandbox.vercel.app`. The results are the ones the
scripts printed.

| Script           | Environment                                              | Result                                                                                                    |
| ---------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `playground.ps1` | Windows PowerShell, Windows 11                           | All six steps as documented, ending `APPROVED` (receipt `RC-88ff417f`) and the replay refused.            |
| `playground.py`  | Python 3.14, `parmana` 1.5.0 with `[verify]`, Windows    | All seven steps as documented, including the offline check (`verifies offline: True`).                    |
| `playground.ts`  | Node.js 24.22.1, `tsx`, `@parmana/sdk` from npm, Windows | All seven steps as documented, including the offline check (`verifies offline: true`).                    |
| `playground.sh`  | bash with `uuidgen` present, and bash without it         | All seven steps as documented, both with and without `uuidgen` (the fallback is used when it is missing). |

Not tested: the rate limit (30 requests a minute for the shared demo key). Testing it would block other visitors.

Run the scripts again after any change to the sandbox, the SDKs or the scripts, and update this table with the date.

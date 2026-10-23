# Sandbox playground scripts

The scripts shown on the docs Playground page (`docs/site/playground.mdx`). Each runs the same seven steps against the
public sandbox, `https://parmana-sandbox.vercel.app`, with the published demo key: who am I, the policy in effect, a
refusal with no approval, a demo approval, an approved and signed release, an offline check of the signed record, and
a refusal of the reused approval.

| File             | Needs                                                                 | Run                                                       |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `playground.sh`  | bash, curl, `uuidgen`                                                 | `bash playground.sh`                                      |
| `playground.ps1` | Windows PowerShell 5.1 or later                                       | `powershell -ExecutionPolicy Bypass -File playground.ps1` |
| `playground.ts`  | `npm install @parmana/sdk tsx`, `PARMANA_API_KEY` set to the demo key | `npx tsx playground.ts`                                   |
| `playground.py`  | `pip install "parmana[verify]" requests`, `PARMANA_API_KEY` set       | `python playground.py`                                    |

They are not part of `npm run examples`, because they call a live server. Run them against the sandbox after changing
one, then keep the page equal to the files: `tests/architecture/sandbox-playground.test.ts` fails if they differ. The
Python script verifies the record as raw JSON because of `docs/VERIFICATION-GAPS.md` G-85.

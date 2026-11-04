# Dependabot alerts runbook

How to read a Dependabot alert, check that a fix is in the default branch, and verify it on your own machine. Written from the three alerts on `pavancharak/parmana-core` on 2026-10-22, and from PR #14, which closed them.

**Read first:** [README.md](README.md) for the rules that apply to every runbook.

---

## 1. What was open and what fixed it

| Alert | Package                            | Severity | Affected                      | Patched    | Where it is pinned            | Fixed by |
| ----- | ---------------------------------- | -------- | ----------------------------- | ---------- | ----------------------------- | -------- |
| #3    | `certifi` (pip, dev requirement)   | Critical | `>= 2019.03.09, < 2026.10.19` | 2026.10.19 | `python/requirements-dev.txt` | PR #14   |
| #2    | `markdown-it` (npm, via `typedoc`) | High     | `>= 14.1.0, < 14.3.3`         | 14.3.3     | `package-lock.json`           | PR #14   |
| #1    | `markdown-it` (npm, via `typedoc`) | Low      | `< 14.3.3`                    | 14.3.3     | `package-lock.json`           | PR #14   |

Both packages are development dependencies. Neither ships in the production server or the Python SDK. The certifi advisory says to rebuild any container image that vendors certifi. This repository has no Dockerfile that installs certifi, so there was nothing to rebuild.

**Current state on `main` (commit `6330375`):**

- `python/requirements-dev.txt` pins `certifi==2026.10.19` with the two PyPI hashes.
- `package-lock.json` resolves `markdown-it` to `14.3.3`.
- All three alerts show as fixed. Alert #2 and #1 show "closed this as completed in #14".

---

## 2. What each advisory means

**certifi (#3, GHSA-6q48-6c7w-9gw2).** Certifi versions before 2026.10.18 bundle the `emSign ECC Root CA - G3` root. Its eMudhra intermediate keys were compromised and revoked. 2026.10.18 removed all emSign roots. 2026.10.19 put back the emSign roots that are not affected.

We checked this against the wheels ourselves. The old bundle has 121 certificates and the new one has 120. The one removed is `emSign ECC Root CA - G3`. The other emSign roots are still present, as the advisory says.

**markdown-it (#2, GHSA-gfr2-rv44-r23c, CVE-2026-111758).** Rendering one unclosed multi-line link reference definition takes quadratic time. The regression was introduced in 14.0.0. A 400 KB input took about 18 seconds in the reported test.

**markdown-it (#1, GHSA-vfgh-jcmw-g37q, CVE-2026-111766).** With `html: true`, repeated unterminated HTML comments, processing instructions, declarations and CDATA inside a paragraph take quadratic time. The default configuration has HTML disabled.

14.3.3 changes two source files. `lib/rules_block/reference.mjs` is the link reference definition code, which alert #2 names. `lib/rules_inline/html_inline.mjs` is the inline HTML code, which alert #1 names. We compared the 14.3.2 and 14.3.3 packages to confirm this.

---

## 3. Check an alert yourself

1. Open https://github.com/pavancharak/parmana-core/security/dependabot
2. Click the alert title.
3. In **Vulnerability found in your code**, read **Patched version**.
4. The fix is in place when `main` has that version or a later one. The check is in section 4.

If the patched version is higher than the version pinned on `main`, the alert is still open. Update the pin and open a new PR. Do not dismiss the alert.

---

## 4. Check the fix is on `main`

Run these in PowerShell from the repository root.

```powershell
git fetch origin
git show origin/main:python/requirements-dev.txt | Select-String 'certifi=='
git show origin/main:package-lock.json | Select-String -Context 0,2 '"node_modules/markdown-it"'
```

Expected:

- The first command prints `certifi==2026.10.19 \`.
- The second command prints `"version": "14.3.3"` on the line after `"node_modules/markdown-it"`.

---

## 5. Check the pinned hashes

The certifi pin uses hashes so pip can refuse a file that does not match.

```powershell
$req = "$env:TEMP\certifi-check.txt"
Set-Content -Encoding ascii $req "certifi==2026.10.19 --hash=sha256:42d35340cc5b9ba78e818ddbff0c5b1c2b779de448a340fd1b989f5fa8670e1b --hash=sha256:035c1e85572b141bf1c3a3eff0e33a8eb74917522f2559075ff8d2fea780a1ae"
pip download --require-hashes --no-deps -r $req -d "$env:TEMP\certdl"
echo "EXIT: $LASTEXITCODE"
```

Expected: `EXIT: 0`. Any other value means the hashes do not match the files on PyPI. Stop and do not install the package.

---

## 6. Check the install works on Node 24

The project requires Node 24 or later (`engines` in `package.json`).

```powershell
node --version
cd D:\last\parmana-core
git checkout main
git pull
npm ci
npm run typecheck
echo "EXIT: $LASTEXITCODE"
```

Expected: `node --version` prints `v24.x` or higher, and the last line is `EXIT: 0`.

Verified 2026-10-22: Node v24.18.0, `npm ci` installed 759 packages with 0 vulnerabilities, typecheck exit 0.

---

## 7. Update a flagged package later

Follow the same steps as this fix.

1. Find the patched version on the alert page (section 3).
2. Change only the one pin. For npm packages, use `npm update <name>` on Node 24, or edit the single `node_modules/<name>` entry in `package-lock.json`. For Python, change the `==` line and replace its hashes with the PyPI values.
3. Check the lock diff. It should touch only the entry you meant to change.
4. Run `npx vitest run tests/architecture` and `npm run typecheck`.
5. Commit on a branch. The pre-commit hook scans for secrets and runs the full preflight, so the commit takes several minutes.
6. Open a PR into `main` and merge it when the required checks pass.

**Warning on the lock file.** npm 10 on Node 22 removed the `libc` field from several optional packages in `package-lock.json`. That change is unrelated to the update and must not be committed. Run lock updates on Node 24, and check `git diff package-lock.json` before you commit.

---

## 8. If the pre-commit hook blocks the commit

The hook stops the commit when gitleaks is not installed, because it cannot scan for secrets. Install gitleaks, then retry. Do not use `--no-verify` to skip the scan. The sandbox used for this fix needed the same install.

```powershell
gitleaks version
```

If the hook reports a leak, it names the file and rule. Read the file, remove the secret, and do not commit it. Do not add the secret to `.gitleaks.toml` unless it is a documented test value.

---

## 9. Why each step exists

- **Hashes on the certifi pin.** A tampered package on PyPI would otherwise install without a warning.
- **Node 24 check.** The project declares Node 24 or later in `engines`, so a check on an older Node does not test the same setup.
- **Lock diff check.** A lock file changed by an older npm can silently change the versions of unrelated packages.
- **Alert check on the page.** Dependabot's own patched version is the only authoritative answer. Our reading of the source is supporting evidence, not proof.

#!/usr/bin/env python3
"""Production Readiness Gate engine.

Evaluates every check in the readiness policy and writes evidence. Standard
library only, so it runs the same way locally and in CI. Run it with -I.

Verdict rules (strict, fail closed):
  * A check passes only when its evidence positively shows it passed.
  * A check that cannot run, times out, errors, or has no evidence FAILS.
  * A gate passes only when every one of its checks passes.
  * The overall verdict passes only when every gate passes.
  * The process exits 0 only on an overall PASS.

Check types:
  command              run argv (no shell) from the repository root; exit 0 passes
  check_run            the named GitHub check runs for the commit concluded "success"
  file_exists          a path exists in the repository
  no_tracked_files     git tracks no file whose basename matches a forbidden pattern
  env_keys_documented  every required key appears in the example env file
  licence_policy       no installed production dependency has a denied licence
  changelog_has_version CHANGELOG.md has a heading for the package version
  manual               an owner-signed, unexpired record exists in evidence/manual/

Usage:
  python -I production-readiness/scripts/evaluate-gates.py \
      --policy <policy.json> --repo-root . --out <dir> [--sha <commit>] \
      [--gates G1,G2] [--skip-commands]

Environment for check_run checks: GITHUB_TOKEN and GITHUB_REPOSITORY, and --sha.
Without them every check_run check FAILS.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

OUTPUT_TAIL_BYTES = 4000
PASS, FAIL, SKIPPED = "PASS", "FAIL", "SKIPPED"


class CheckResult:
    def __init__(self, check: dict[str, Any], status: str, detail: str, evidence: dict[str, Any] | None = None):
        self.id = check["id"]
        self.title = check.get("title", check["id"])
        self.type = check.get("type", "unknown")
        self.status = status
        self.detail = detail
        self.evidence = evidence or {}

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "title": self.title, "type": self.type, "status": self.status,
                "detail": self.detail, "evidence": self.evidence}


def _today() -> dt.date:
    return dt.date.today()


def run_command(check: dict[str, Any], root: Path) -> CheckResult:
    argv = check["argv"]
    timeout = int(check.get("timeout_s", 900))
    started = time.monotonic()
    try:
        proc = subprocess.run(argv, cwd=root, capture_output=True, text=True, timeout=timeout, shell=False)
    except subprocess.TimeoutExpired:
        return CheckResult(check, FAIL, f"timed out after {timeout}s", {"argv": argv})
    except FileNotFoundError:
        return CheckResult(check, FAIL, f"command not found: {argv[0]}", {"argv": argv})
    output = (proc.stdout or "") + (proc.stderr or "")
    tail = output[-OUTPUT_TAIL_BYTES:]
    evidence = {
        "argv": argv,
        "exit_code": proc.returncode,
        "duration_s": round(time.monotonic() - started, 1),
        "output_sha256": hashlib.sha256(output.encode("utf-8", "replace")).hexdigest(),
        "output_tail": tail,
    }
    if proc.returncode == 0:
        return CheckResult(check, PASS, "exit 0", evidence)
    return CheckResult(check, FAIL, f"exit {proc.returncode}", evidence)


def github_check_runs(repo: str, sha: str, token: str) -> dict[str, str]:
    """Return {check name: conclusion}, newest run per name, across all pages."""
    results: dict[str, tuple[str, str]] = {}
    page = 1
    while True:
        url = f"https://api.github.com/repos/{repo}/commits/{sha}/check-runs?per_page=100&page={page}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.load(resp)
        runs = body.get("check_runs", [])
        for run in runs:
            name = run.get("name", "")
            started = run.get("started_at") or ""
            conclusion = run.get("conclusion") or ("pending" if run.get("status") != "completed" else "unknown")
            if name not in results or started > results[name][0]:
                results[name] = (started, conclusion)
        if len(runs) < 100:
            break
        page += 1
    return {name: conclusion for name, (_, conclusion) in results.items()}


CHECK_RUN_NOT_YET = ("pending", "missing")


def check_check_runs(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    """Wait for the named check runs to finish, then require every one to succeed.

    A run still in progress ("pending") or not yet created ("missing") is waited
    for, up to wait_s seconds, polling every poll_s seconds. Without the wait,
    the gate reads check runs while other workflows are still running and fails
    for a reason that is not a real failure. A run that is still not finished,
    or not created, when the wait ends is a failure.
    """
    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    sha = ctx.get("sha", "")
    if not (token and repo and sha):
        return CheckResult(check, FAIL, "GITHUB_TOKEN, GITHUB_REPOSITORY and --sha are required", {})
    wait_s = int(check.get("wait_s", 900))
    poll_s = int(check.get("poll_s", 30))
    deadline = time.monotonic() + wait_s
    polls = 0
    while True:
        try:
            conclusions = github_check_runs(repo, sha, token)
        except (urllib.error.URLError, OSError, json.JSONDecodeError) as exc:
            return CheckResult(check, FAIL, f"could not read check runs: {exc}", {})
        polls += 1
        found = {name: conclusions.get(name, "missing") for name in check["names"]}
        waiting = [n for n, c in found.items() if c in CHECK_RUN_NOT_YET]
        if not waiting or time.monotonic() >= deadline:
            break
        time.sleep(poll_s)
    failing = {name: c for name, c in found.items() if c != "success"}
    evidence = {"sha": sha, "conclusions": found, "polls": polls, "wait_s": wait_s}
    if failing:
        detail = "not successful: " + ", ".join(f"{n}={c}" for n, c in failing.items())
        if waiting:
            detail += f" (still waiting after {wait_s}s)"
        return CheckResult(check, FAIL, detail, evidence)
    return CheckResult(check, PASS, "all named check runs succeeded", evidence)


def check_file_exists(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    path = ctx["root"] / check["path"]
    if path.exists():
        return CheckResult(check, PASS, f"{check['path']} exists", {"path": check["path"]})
    return CheckResult(check, FAIL, f"{check['path']} is missing", {"path": check["path"]})


def check_no_tracked_files(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    try:
        out = subprocess.run(["git", "ls-files"], cwd=ctx["root"], capture_output=True, text=True, timeout=60, check=True).stdout
    except (subprocess.SubprocessError, OSError) as exc:
        return CheckResult(check, FAIL, f"git ls-files failed: {exc}", {})
    forbidden = set(check["patterns"])
    allowed = set(check.get("allow", []))
    offending = []
    for tracked in out.splitlines():
        name = Path(tracked).name
        if name in forbidden and name not in allowed:
            offending.append(tracked)
    if offending:
        return CheckResult(check, FAIL, "tracked: " + ", ".join(offending), {"files": offending})
    return CheckResult(check, PASS, "no forbidden files tracked", {"patterns": sorted(forbidden)})


def _env_keys(path: Path) -> set[str]:
    keys = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*#?\s*([A-Z][A-Z0-9_]*)=", line)
        if m:
            keys.add(m.group(1))
    return keys


def check_env_keys_documented(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    example = ctx["root"] / ctx["policy"]["required_env_file"]
    if not example.exists():
        return CheckResult(check, FAIL, f"{ctx['policy']['required_env_file']} is missing", {})
    documented = _env_keys(example)
    missing = [k for k in ctx["policy"]["required_env_keys"] if k not in documented]
    if missing:
        return CheckResult(check, FAIL, "undocumented: " + ", ".join(missing), {"missing": missing})
    return CheckResult(check, PASS, "all required keys documented", {"required": ctx["policy"]["required_env_keys"]})


def _platform_excluded(meta: dict[str, Any]) -> bool:
    """True when npm would not install this optional package on this platform."""
    if not meta.get("optional"):
        return False
    machine = platform.machine().lower()
    arch = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64"}.get(machine, machine)
    return _os_or_cpu_excludes(meta.get("os"), sys.platform) or _os_or_cpu_excludes(meta.get("cpu"), arch)


def _os_or_cpu_excludes(allowed: list[str] | None, current: str) -> bool:
    if not allowed:
        return False
    positives = [a for a in allowed if not a.startswith("!")]
    negatives = [a[1:] for a in allowed if a.startswith("!")]
    if current in negatives:
        return True
    return bool(positives) and current not in positives


def check_licence_policy(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    root = ctx["root"]
    lock_path = root / "package-lock.json"
    try:
        packages = json.loads(lock_path.read_text(encoding="utf-8"))["packages"]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        return CheckResult(check, FAIL, f"cannot read package-lock.json: {exc}", {})
    denied = set(ctx["policy"]["licence_deny"])
    problems, checked, excluded = [], 0, []
    for key, meta in packages.items():
        # Skip the root project and dev-only packages. devOptional packages can
        # still ship to production, so they stay in scope.
        if not key or meta.get("dev"):
            continue
        pkg_json = root / key / "package.json"
        if not pkg_json.exists():
            if _platform_excluded(meta):
                excluded.append(key)  # npm skips optional packages for other platforms
                continue
            problems.append(f"{key}: not installed, licence cannot be verified")
            continue
        info = json.loads(pkg_json.read_text(encoding="utf-8"))
        licence = info.get("license")
        if isinstance(licence, dict):
            licence = licence.get("type", "")
        licence = str(licence or "UNLICENSED")
        checked += 1
        if licence in denied or any(tok.strip("() ") in denied for tok in re.split(r" OR | AND |/", licence)):
            problems.append(f"{key}: {licence}")
    evidence = {"production_packages_checked": checked, "platform_excluded": len(excluded)}
    if problems:
        evidence["problems"] = problems[:50]
        return CheckResult(check, FAIL, f"{len(problems)} package(s) with denied or unverifiable licence", evidence)
    return CheckResult(check, PASS, f"{checked} production packages, none denied", evidence)


def check_changelog(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    version = ctx["version"]
    path = ctx["root"] / "CHANGELOG.md"
    if not path.exists():
        return CheckResult(check, FAIL, "CHANGELOG.md is missing", {"version": version})
    text = path.read_text(encoding="utf-8")
    if re.search(rf"^##\s+\[?{re.escape(version)}\]?\b", text, re.MULTILINE):
        return CheckResult(check, PASS, f"CHANGELOG.md has a heading for {version}", {"version": version})
    return CheckResult(check, FAIL, f"CHANGELOG.md has no heading for {version}", {"version": version})


def check_manual(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    record_name = check["record"]
    # Owner records come from the trusted tree (the base branch), never from the
    # change under review, so a pull request cannot approve itself.
    path = ctx["manual_root"] / "production-readiness" / "evidence" / "manual" / f"{record_name}.json"
    if not path.exists():
        return CheckResult(check, FAIL, f"no owner record at evidence/manual/{record_name}.json", {})
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return CheckResult(check, FAIL, f"record is not valid JSON: {exc}", {})
    approver = str(record.get("approver", "")).strip()
    try:
        approved_on = dt.date.fromisoformat(record["approved_on"])
        expires_on = dt.date.fromisoformat(record["expires_on"])
    except (KeyError, ValueError):
        return CheckResult(check, FAIL, "record needs approved_on and expires_on as YYYY-MM-DD", {})
    if not approver:
        return CheckResult(check, FAIL, "record has no approver", {})
    if record.get("record") != record_name:
        return CheckResult(check, FAIL, "record name does not match the policy", {})
    if approved_on > _today():
        return CheckResult(check, FAIL, "record approval date is in the future", {})
    if record.get("release_version") != ctx["version"]:
        return CheckResult(check, FAIL, f"record covers {record.get('release_version')!r}, not {ctx['version']!r}", {})
    if expires_on < _today():
        return CheckResult(check, FAIL, f"record expired on {expires_on.isoformat()}", {})
    return CheckResult(check, PASS, f"owner record by {approver}, valid until {expires_on.isoformat()}",
                       {"approver": approver, "approved_on": approved_on.isoformat(), "expires_on": expires_on.isoformat()})


def check_command(check: dict[str, Any], ctx: dict[str, Any]) -> CheckResult:
    if ctx.get("skip_commands"):
        return CheckResult(check, SKIPPED, "skipped by --skip-commands (local partial run, not a release result)", {})
    return run_command(check, ctx["root"])


HANDLERS: dict[str, Callable[[dict[str, Any], dict[str, Any]], CheckResult]] = {
    "command": check_command,
    "check_run": check_check_runs,
    "file_exists": check_file_exists,
    "no_tracked_files": check_no_tracked_files,
    "env_keys_documented": check_env_keys_documented,
    "licence_policy": check_licence_policy,
    "changelog_has_version": check_changelog,
    "manual": check_manual,
}


def evaluate(policy: dict[str, Any], root: Path, sha: str, only_gates: set[str] | None, skip_commands: bool,
             manual_root: Path | None = None) -> dict[str, Any]:
    version = json.loads((root / policy.get("version_source", "package.json")).read_text(encoding="utf-8"))["version"]
    ctx = {"root": root, "manual_root": manual_root or root, "policy": policy, "sha": sha,
           "version": version, "skip_commands": skip_commands}
    gates_out = []
    for gate in policy["gates"]:
        if only_gates and gate["id"] not in only_gates:
            continue
        results = []
        for check in gate["checks"]:
            handler = HANDLERS.get(check.get("type", ""))
            if handler is None:
                results.append(CheckResult(check, FAIL, f"unknown check type {check.get('type')!r}", {}))
                continue
            try:
                results.append(handler(check, ctx))
            except Exception as exc:  # fail closed on any unexpected error
                results.append(CheckResult(check, FAIL, f"check raised {type(exc).__name__}: {exc}", {}))
        if any(r.status == FAIL for r in results):
            status = FAIL
        elif all(r.status == PASS for r in results):
            status = PASS
        else:
            status = FAIL  # a skipped check cannot pass a gate
        gates_out.append({"id": gate["id"], "name": gate["name"], "status": status,
                          "checks": [r.to_dict() for r in results]})
    overall = PASS if gates_out and all(g["status"] == PASS for g in gates_out) else FAIL
    if only_gates:
        overall = FAIL  # a partial run can never be a release verdict
    return {
        "policy_version": policy["policy_version"],
        "mode": policy.get("mode", "strict"),
        "repository": policy.get("repository", ""),
        "version": version,
        "sha": sha or None,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "partial_run": bool(only_gates),
        "skip_commands": skip_commands,
        "overall": overall,
        "gates": gates_out,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [f"# Production Readiness Gate: {report['overall']}", "",
             f"- Repository: `{report['repository']}`",
             f"- Version: `{report['version']}`",
             f"- Commit: `{report['sha'] or 'not supplied'}`",
             f"- Policy version: {report['policy_version']} ({report['mode']})",
             f"- Generated: {report['generated_at']}", ""]
    if report["partial_run"] or report["skip_commands"]:
        lines += ["> This is a partial or local run. It is not a release verdict.", ""]
    lines += ["| Gate | Status |", "|---|---|"]
    for g in report["gates"]:
        lines.append(f"| {g['id']} {g['name']} | {g['status']} |")
    lines.append("")
    for g in report["gates"]:
        lines += [f"## {g['id']} {g['name']}: {g['status']}", ""]
        for c in g["checks"]:
            lines.append(f"- **{c['status']}** `{c['id']}` {c['title']}: {c['detail']}")
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--repo-root", default=Path("."), type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--sha", default=os.environ.get("GITHUB_SHA", ""))
    parser.add_argument("--gates", default="", help="comma-separated gate ids for a partial local run")
    parser.add_argument("--skip-commands", action="store_true", help="do not run command checks (local use only)")
    parser.add_argument("--manual-root", type=Path, default=None,
                        help="tree to read owner records from; CI passes the trusted base branch checkout")
    args = parser.parse_args(argv)

    root = args.repo_root.resolve()
    policy = json.loads(args.policy.read_text(encoding="utf-8"))
    only = {g.strip() for g in args.gates.split(",") if g.strip()} or None
    manual_root = args.manual_root.resolve() if args.manual_root else None
    report = evaluate(policy, root, args.sha, only, args.skip_commands, manual_root)

    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    (args.out / "report.md").write_text(render_markdown(report), encoding="utf-8")
    print(f"Production Readiness Gate: {report['overall']}")
    for g in report["gates"]:
        print(f"  {g['id']} {g['name']}: {g['status']}")
    print(f"Evidence written to {args.out}")
    return 0 if report["overall"] == PASS else 1


if __name__ == "__main__":
    sys.exit(main())

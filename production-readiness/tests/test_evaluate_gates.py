"""Tests for the Production Readiness Gate engine. Standard library only.

Run from the repository root:
    python -I -m unittest discover -s production-readiness/tests -t production-readiness/tests
"""

from __future__ import annotations

import datetime as dt
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ENGINE_PATH = Path(__file__).resolve().parent.parent / "scripts" / "evaluate-gates.py"
spec = importlib.util.spec_from_file_location("evaluate_gates", ENGINE_PATH)
eg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eg)


def base_policy(**overrides):
    policy = {
        "policy_version": 1,
        "mode": "strict",
        "repository": "example/repo",
        "version_source": "package.json",
        "required_env_file": ".env.example",
        "required_env_keys": ["DATABASE_URL"],
        "licence_deny": ["AGPL-3.0"],
        "gates": [],
    }
    policy.update(overrides)
    return policy


class RepoFixture(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        (self.root / "package.json").write_text(json.dumps({"version": "1.2.3"}))
        (self.root / ".env.example").write_text("DATABASE_URL=postgres://x\n# PARMANA_DATABASE_CA_FILE=\n")

    def tearDown(self):
        self._tmp.cleanup()

    def ctx(self, policy=None, **extra):
        ctx = {"root": self.root, "manual_root": self.root, "policy": policy or base_policy(), "sha": "abc123",
               "version": "1.2.3", "skip_commands": False}
        ctx.update(extra)
        return ctx


class CommandCheckTests(RepoFixture):
    def test_exit_zero_passes(self):
        check = {"id": "c", "type": "command", "argv": ["python3", "-c", "print('ok')"], "timeout_s": 30}
        result = eg.check_command(check, self.ctx())
        self.assertEqual(result.status, eg.PASS)
        self.assertEqual(result.evidence["exit_code"], 0)
        self.assertEqual(len(result.evidence["output_sha256"]), 64)

    def test_nonzero_exit_fails(self):
        check = {"id": "c", "type": "command", "argv": ["python3", "-c", "import sys; sys.exit(3)"], "timeout_s": 30}
        result = eg.check_command(check, self.ctx())
        self.assertEqual(result.status, eg.FAIL)
        self.assertEqual(result.evidence["exit_code"], 3)

    def test_timeout_fails(self):
        check = {"id": "c", "type": "command", "argv": ["python3", "-c", "import time; time.sleep(5)"], "timeout_s": 1}
        self.assertEqual(eg.check_command(check, self.ctx()).status, eg.FAIL)

    def test_missing_executable_fails(self):
        check = {"id": "c", "type": "command", "argv": ["no-such-binary-xyz"], "timeout_s": 5}
        result = eg.check_command(check, self.ctx())
        self.assertEqual(result.status, eg.FAIL)
        self.assertIn("not found", result.detail)

    def test_skip_commands_is_skipped_not_passed(self):
        check = {"id": "c", "type": "command", "argv": ["python3", "-c", "pass"]}
        self.assertEqual(eg.check_command(check, self.ctx(skip_commands=True)).status, eg.SKIPPED)


class CheckRunTests(RepoFixture):
    check = {"id": "ci", "type": "check_run", "names": ["build-and-test", "DCO"]}

    def test_fails_without_token(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(eg.check_check_runs(dict(self.check, wait_s=0), self.ctx()).status, eg.FAIL)

    def test_all_success_passes(self):
        env = {"GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "example/repo"}
        runs = {"build-and-test": "success", "DCO": "success"}
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(eg, "github_check_runs", return_value=runs):
            self.assertEqual(eg.check_check_runs(dict(self.check, wait_s=0), self.ctx()).status, eg.PASS)

    def test_missing_or_failed_run_fails(self):
        env = {"GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "example/repo"}
        runs = {"build-and-test": "failure"}
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(eg, "github_check_runs", return_value=runs):
            result = eg.check_check_runs(dict(self.check, wait_s=0), self.ctx())
        self.assertEqual(result.status, eg.FAIL)
        self.assertIn("DCO=missing", result.detail)

    def test_waits_for_pending_run_then_passes(self):
        env = {"GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "example/repo"}
        sequence = [{"build-and-test": "pending", "DCO": "success"},
                    {"build-and-test": "success", "DCO": "success"}]
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(eg, "github_check_runs", side_effect=sequence) as reads, \
                mock.patch.object(eg.time, "sleep") as sleep:
            result = eg.check_check_runs(dict(self.check, wait_s=600, poll_s=5), self.ctx())
        self.assertEqual(result.status, eg.PASS)
        self.assertEqual(reads.call_count, 2)
        sleep.assert_called_once_with(5)

    def test_missing_run_that_never_appears_fails_after_the_wait(self):
        env = {"GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "example/repo"}
        runs = {"build-and-test": "success"}
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(eg, "github_check_runs", return_value=runs) as reads, \
                mock.patch.object(eg.time, "sleep") as sleep:
            result = eg.check_check_runs(dict(self.check, wait_s=0, poll_s=30), self.ctx())
        self.assertEqual(reads.call_count, 1)
        sleep.assert_not_called()
        self.assertEqual(result.status, eg.FAIL)
        self.assertIn("DCO=missing", result.detail)
        self.assertIn("still waiting", result.detail)

    def test_failed_run_is_not_waited_for(self):
        env = {"GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "example/repo"}
        runs = {"build-and-test": "failure", "DCO": "success"}
        with mock.patch.dict(os.environ, env, clear=True), \
                mock.patch.object(eg, "github_check_runs", return_value=runs) as reads, \
                mock.patch.object(eg.time, "sleep") as sleep:
            result = eg.check_check_runs(dict(self.check, wait_s=900), self.ctx())
        self.assertEqual(result.status, eg.FAIL)
        self.assertEqual(reads.call_count, 1)
        sleep.assert_not_called()

    def test_neutral_or_pending_is_not_success(self):
        env = {"GITHUB_TOKEN": "t", "GITHUB_REPOSITORY": "example/repo"}
        runs = {"build-and-test": "neutral", "DCO": "pending"}
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(eg, "github_check_runs", return_value=runs):
            self.assertEqual(eg.check_check_runs(dict(self.check, wait_s=0), self.ctx()).status, eg.FAIL)


class FileAndConfigTests(RepoFixture):
    def test_file_exists(self):
        check = {"id": "f", "type": "file_exists", "path": "package.json"}
        self.assertEqual(eg.check_file_exists(check, self.ctx()).status, eg.PASS)
        self.assertEqual(eg.check_file_exists({"id": "f", "type": "file_exists", "path": "nope"}, self.ctx()).status, eg.FAIL)

    def test_env_keys_documented(self):
        check = {"id": "e", "type": "env_keys_documented"}
        self.assertEqual(eg.check_env_keys_documented(check, self.ctx()).status, eg.PASS)
        policy = base_policy(required_env_keys=["DATABASE_URL", "MISSING_KEY"])
        result = eg.check_env_keys_documented(check, self.ctx(policy=policy))
        self.assertEqual(result.status, eg.FAIL)
        self.assertIn("MISSING_KEY", result.detail)

    def test_commented_example_key_counts_as_documented(self):
        self.assertIn("PARMANA_DATABASE_CA_FILE", eg._env_keys(self.root / ".env.example"))


class LicenceTests(RepoFixture):
    def write_lock(self, packages):
        (self.root / "package-lock.json").write_text(json.dumps({"packages": packages}))

    def install(self, path, licence):
        pkg = self.root / path
        pkg.mkdir(parents=True, exist_ok=True)
        (pkg / "package.json").write_text(json.dumps({"name": path, "license": licence}))

    def test_permitted_licences_pass_and_dev_packages_are_ignored(self):
        self.write_lock({"": {}, "node_modules/a": {}, "node_modules/devonly": {"dev": True}})
        self.install("node_modules/a", "MIT")
        self.install("node_modules/devonly", "AGPL-3.0")  # dev-only, must be ignored
        result = eg.check_licence_policy({"id": "l", "type": "licence_policy"}, self.ctx())
        self.assertEqual(result.status, eg.PASS)
        self.assertEqual(result.evidence["production_packages_checked"], 1)

    def test_denied_licence_fails(self):
        self.write_lock({"node_modules/bad": {}})
        self.install("node_modules/bad", "AGPL-3.0")
        self.assertEqual(eg.check_licence_policy({"id": "l", "type": "licence_policy"}, self.ctx()).status, eg.FAIL)

    def test_denied_licence_inside_an_or_expression_fails(self):
        self.write_lock({"node_modules/dual": {}})
        self.install("node_modules/dual", "(MIT OR AGPL-3.0)")
        self.assertEqual(eg.check_licence_policy({"id": "l", "type": "licence_policy"}, self.ctx()).status, eg.FAIL)

    def test_uninstalled_production_package_fails_closed(self):
        self.write_lock({"node_modules/notinstalled": {}})
        result = eg.check_licence_policy({"id": "l", "type": "licence_policy"}, self.ctx())
        self.assertEqual(result.status, eg.FAIL)
        self.assertIn("cannot be verified", result.evidence["problems"][0])


class RepositoryHygieneTests(RepoFixture):
    def test_tracked_real_env_file_fails(self):
        with mock.patch.object(eg.subprocess, "run") as run:
            run.return_value.stdout = "src/app.ts\n.env\n.env.example\n"
            check = {"id": "g", "type": "no_tracked_files", "patterns": [".env"], "allow": [".env.example"]}
            result = eg.check_no_tracked_files(check, self.ctx())
        self.assertEqual(result.status, eg.FAIL)
        self.assertEqual(result.evidence["files"], [".env"])

    def test_example_env_file_is_allowed(self):
        with mock.patch.object(eg.subprocess, "run") as run:
            run.return_value.stdout = ".env.example\n"
            check = {"id": "g", "type": "no_tracked_files", "patterns": [".env"], "allow": [".env.example"]}
            self.assertEqual(eg.check_no_tracked_files(check, self.ctx()).status, eg.PASS)

    def test_changelog_needs_version_heading(self):
        check = {"id": "c", "type": "changelog_has_version"}
        self.assertEqual(eg.check_changelog(check, self.ctx()).status, eg.FAIL)  # no file
        (self.root / "CHANGELOG.md").write_text("## [1.2.30] - 2026-01-01\n")
        self.assertEqual(eg.check_changelog(check, self.ctx()).status, eg.FAIL)  # prefix of another version
        (self.root / "CHANGELOG.md").write_text("## [1.2.3] - 2026-01-01\n")
        self.assertEqual(eg.check_changelog(check, self.ctx()).status, eg.PASS)


class ManualRecordTests(RepoFixture):
    def setUp(self):
        super().setUp()
        (self.root / "production-readiness" / "evidence" / "manual").mkdir(parents=True)
        self.check = {"id": "m", "type": "manual", "record": "deployment-verification"}

    def write(self, **fields):
        record = {"record": "deployment-verification", "approver": "Owner", "approved_on": "2026-01-01",
                  "expires_on": "2099-01-01", "release_version": "1.2.3"}
        record.update(fields)
        (self.root / "production-readiness" / "evidence" / "manual" / "deployment-verification.json").write_text(json.dumps(record))

    def test_missing_record_fails(self):
        self.assertEqual(eg.check_manual(self.check, self.ctx()).status, eg.FAIL)

    def test_valid_record_passes(self):
        self.write()
        self.assertEqual(eg.check_manual(self.check, self.ctx()).status, eg.PASS)

    def test_expired_record_fails(self):
        self.write(expires_on="2000-01-01")
        self.assertIn("expired", eg.check_manual(self.check, self.ctx()).detail)

    def test_missing_approver_fails(self):
        self.write(approver="  ")
        self.assertEqual(eg.check_manual(self.check, self.ctx()).status, eg.FAIL)

    def test_record_name_must_match_policy(self):
        self.write(record="backup-recovery-drill")
        self.assertEqual(eg.check_manual(self.check, self.ctx()).status, eg.FAIL)

    def test_record_for_another_version_fails(self):
        self.write(release_version="0.0.1")
        self.assertIn("not '1.2.3'", eg.check_manual(self.check, self.ctx()).detail)

    def test_record_for_this_version_passes(self):
        self.write(release_version="1.2.3")
        self.assertEqual(eg.check_manual(self.check, self.ctx()).status, eg.PASS)

    def test_future_approval_date_fails(self):
        self.write(approved_on="2999-01-01")
        self.assertEqual(eg.check_manual(self.check, self.ctx()).status, eg.FAIL)


class EventScopeTests(RepoFixture):
    def gate(self, checks):
        return base_policy(gates=[{"id": "G1", "name": "A", "checks": checks}])

    def test_check_outside_its_event_is_not_applicable_and_gate_still_passes(self):
        policy = self.gate([
            {"id": "ok", "type": "file_exists", "path": "package.json"},
            {"id": "release-only", "type": "file_exists", "path": "missing", "run_on": ["release"]},
        ])
        report = eg.evaluate(policy, self.root, "abc", None, False, event="pull_request")
        statuses = {c["id"]: c["status"] for c in report["gates"][0]["checks"]}
        self.assertEqual(statuses, {"ok": eg.PASS, "release-only": eg.NOT_APPLICABLE})
        self.assertEqual(report["gates"][0]["status"], eg.PASS)
        self.assertEqual(report["overall"], eg.PASS)

    def test_check_runs_on_its_own_event(self):
        policy = self.gate([{"id": "release-only", "type": "file_exists", "path": "missing", "run_on": ["release"]}])
        report = eg.evaluate(policy, self.root, "abc", None, False, event="release")
        self.assertEqual(report["gates"][0]["checks"][0]["status"], eg.FAIL)

    def test_gate_with_nothing_applicable_fails(self):
        policy = self.gate([{"id": "release-only", "type": "file_exists", "path": "package.json", "run_on": ["release"]}])
        report = eg.evaluate(policy, self.root, "abc", None, False, event="pull_request")
        self.assertEqual(report["gates"][0]["status"], eg.FAIL)
        self.assertEqual(report["overall"], eg.FAIL)

    def test_failing_applicable_check_still_fails_the_gate(self):
        policy = self.gate([
            {"id": "ok", "type": "file_exists", "path": "package.json"},
            {"id": "bad", "type": "file_exists", "path": "missing"},
            {"id": "release-only", "type": "file_exists", "path": "package.json", "run_on": ["release"]},
        ])
        report = eg.evaluate(policy, self.root, "abc", None, False, event="pull_request")
        self.assertEqual(report["gates"][0]["status"], eg.FAIL)


class EvaluationTests(RepoFixture):
    def test_gate_passes_only_when_all_checks_pass(self):
        policy = base_policy(gates=[{"id": "G1", "name": "Q", "checks": [
            {"id": "ok", "type": "file_exists", "path": "package.json"},
            {"id": "bad", "type": "file_exists", "path": "missing"},
        ]}])
        report = eg.evaluate(policy, self.root, "abc123", None, False)
        self.assertEqual(report["gates"][0]["status"], eg.FAIL)
        self.assertEqual(report["overall"], eg.FAIL)

    def test_all_gates_passing_gives_overall_pass(self):
        policy = base_policy(gates=[
            {"id": "G1", "name": "A", "checks": [{"id": "x", "type": "file_exists", "path": "package.json"}]},
            {"id": "G2", "name": "B", "checks": [{"id": "y", "type": "file_exists", "path": ".env.example"}]},
        ])
        self.assertEqual(eg.evaluate(policy, self.root, "abc", None, False)["overall"], eg.PASS)

    def test_skipped_check_cannot_pass_a_gate(self):
        policy = base_policy(gates=[{"id": "G1", "name": "A", "checks": [
            {"id": "c", "type": "command", "argv": ["python3", "-c", "pass"]}]}])
        report = eg.evaluate(policy, self.root, "abc", None, True)
        self.assertEqual(report["gates"][0]["status"], eg.FAIL)
        self.assertEqual(report["overall"], eg.FAIL)

    def test_unknown_check_type_fails(self):
        policy = base_policy(gates=[{"id": "G1", "name": "A", "checks": [{"id": "x", "type": "telepathy"}]}])
        self.assertEqual(eg.evaluate(policy, self.root, "abc", None, False)["overall"], eg.FAIL)

    def test_unexpected_exception_fails_closed(self):
        policy = base_policy(gates=[{"id": "G1", "name": "A", "checks": [{"id": "x", "type": "file_exists", "path": "package.json"}]}])
        with mock.patch.dict(eg.HANDLERS, {"file_exists": mock.Mock(side_effect=RuntimeError("boom"))}):
            report = eg.evaluate(policy, self.root, "abc", None, False)
        self.assertEqual(report["overall"], eg.FAIL)
        self.assertIn("RuntimeError", report["gates"][0]["checks"][0]["detail"])

    def test_partial_run_can_never_be_overall_pass(self):
        policy = base_policy(gates=[{"id": "G1", "name": "A", "checks": [{"id": "x", "type": "file_exists", "path": "package.json"}]}])
        report = eg.evaluate(policy, self.root, "abc", {"G1"}, False)
        self.assertTrue(report["partial_run"])
        self.assertEqual(report["overall"], eg.FAIL)

    def test_main_exit_code_reflects_verdict(self):
        policy_path = self.root / "policy.json"
        policy_path.write_text(json.dumps(base_policy(gates=[
            {"id": "G1", "name": "A", "checks": [{"id": "x", "type": "file_exists", "path": "nope"}]}])))
        out = self.root / "out"
        self.assertEqual(eg.main(["--policy", str(policy_path), "--repo-root", str(self.root), "--out", str(out)]), 1)
        report = json.loads((out / "report.json").read_text())
        self.assertEqual(report["overall"], eg.FAIL)
        self.assertTrue((out / "report.md").exists())


if __name__ == "__main__":
    unittest.main()

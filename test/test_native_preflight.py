"""Run the startup checks with runtimes removed from PATH, not mocked as present."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
PS = shutil.which("powershell") if os.name == "nt" else None
SH = ("C:/Program Files/Git/bin/sh.exe" if os.name == "nt" else "/bin/sh")
NODE = shutil.which("node")


def read_result(command, env=None, timeout=18):
    result = subprocess.run(command, env=env, input=b"", capture_output=True, timeout=timeout)
    if result.returncode:
        raise AssertionError(result.stderr.decode("utf-8", errors="replace"))
    return json.loads(result.stdout.decode("utf-8-sig"))


def assert_choices(case, value):
    message = value["systemMessage"]
    for label in ("协助安装并重试", "查看手动安装说明", "暂不安装继续产品工作"):
        case.assertIn(label, message)
    case.assertEqual(value["hookSpecificOutput"]["hookEventName"], "SessionStart")
    case.assertNotIn("continue", value)  # The check must not block product work.
    case.assertIn("Never install automatically", value["hookSpecificOutput"]["additionalContext"])


@unittest.skipUnless(PS, "Windows PowerShell integration requires Windows")
class WindowsPreflightTests(unittest.TestCase):
    def invoke(self, search_path, output_format="Hook"):
        return read_result([PS, "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned",
                            "-File", str(ROOT / "hooks/check-runtime.ps1"), "-Format", output_format],
                           {**os.environ, "PATH": search_path})

    def test_both_missing_still_emits_a_user_notice_and_install_choices(self):
        with tempfile.TemporaryDirectory(prefix="relayforge-no-runtime-") as empty:
            value = self.invoke(empty)
            assert_choices(self, value)
            self.assertIn("Node.js=missing; Python=missing", value["systemMessage"])
            self.assertEqual(list(Path(empty).iterdir()), [])

    def test_python_present_node_missing(self):
        value = self.invoke(str(Path(sys.executable).parent), "Json")
        self.assertEqual(value["node"], "missing")
        self.assertEqual(value["python"], "ready")

    @unittest.skipUnless(NODE, "Node is needed only for the one-present fixture")
    def test_node_present_python_missing(self):
        value = self.invoke(str(Path(NODE).parent), "Json")
        self.assertEqual(value["node"], "ready")
        self.assertEqual(value["python"], "missing")

    @unittest.skipUnless(NODE and sys.version_info >= (3, 11), "Healthy fixture needs compatible runtimes")
    def test_healthy_environment_has_no_warning_or_installation_prompt(self):
        value = self.invoke(os.environ["PATH"])
        self.assertNotIn("systemMessage", value)
        self.assertIn("Node.js=ready; Python=ready", value["hookSpecificOutput"]["additionalContext"])

    def test_registered_windows_command_handles_unicode_and_spaces_without_runtimes(self):
        definition = json.loads((ROOT / "hooks/codex-runtime.json").read_text())["hooks"]["SessionStart"][0]["hooks"][0]
        with tempfile.TemporaryDirectory(prefix="relayforge 中文 空格 & '") as directory:
            hooks = Path(directory) / "hooks"
            shutil.copytree(ROOT / "hooks", hooks)
            env = {**os.environ, "PLUGIN_ROOT": directory,
                   "PATH": str(Path(PS).parent)}
            value = read_result([PS, "-NoProfile", "-NonInteractive", "-Command", definition["commandWindows"]], env)
            assert_choices(self, value)
            self.assertIn("Python=missing", value["systemMessage"])

    def test_probe_timeout_and_uncertainty_do_not_claim_an_installation_is_missing(self):
        env = {**os.environ, "RELAYFORGE_TEST_ROOT": str(ROOT)}
        command = ". (Join-Path $env:RELAYFORGE_TEST_ROOT 'hooks/check-runtime.ps1'); "
        command += "Invoke-RuntimeProbe 'powershell.exe' '-NoProfile -Command Start-Sleep -Seconds 10' | ConvertTo-Json -Compress"
        start = time.monotonic()
        value = read_result([PS, "-NoProfile", "-NonInteractive", "-Command", command], env, timeout=10)
        self.assertLess(time.monotonic() - start, 8)
        self.assertEqual(value["Status"], "probe_failed")

    def test_unsupported_and_sqlite_failure_are_distinct_from_missing_commands(self):
        env = {**os.environ, "RELAYFORGE_TEST_ROOT": str(ROOT)}
        command = ". (Join-Path $env:RELAYFORGE_TEST_ROOT 'hooks/check-runtime.ps1'); "
        command += "function Invoke-RuntimeProbe($Name,$Arguments) { if ($Name -eq 'node') "
        command += "{ return @{Status='ok';Output='v16.20.0'} }; return @{Status='ok';Output='sqlite_unavailable'} }; "
        command += "Get-NativeRuntimeStatus | ConvertTo-Json -Compress"
        value = read_result([PS, "-NoProfile", "-NonInteractive", "-Command", command], env)
        self.assertEqual(value["node"], "unsupported")
        self.assertEqual(value["python"], "sqlite_unavailable")


@unittest.skipUnless(Path(SH).is_file(), "POSIX shell integration needs a system shell")
class PosixPreflightTests(unittest.TestCase):
    def test_both_missing_needs_neither_a_runtime_nor_json_parser(self):
        with tempfile.TemporaryDirectory(prefix="relayforge-no-runtime-") as empty:
            value = read_result([SH, (ROOT / "hooks/check-runtime.sh").as_posix()], {**os.environ, "PATH": empty})
            assert_choices(self, value)
            context = value["hookSpecificOutput"]["additionalContext"]
            self.assertIn("Node.js=missing; Python=missing", context)
            self.assertEqual(list(Path(empty).iterdir()), [])

    def test_existing_runtime_probes_do_not_inherit_auto_install_flags(self):
        with tempfile.TemporaryDirectory(prefix="relayforge-runtime-fixtures-") as directory:
            root = Path(directory)
            for name, source in {
                "node": "#!/bin/sh\nprintf 'v24.22.1\\n'\n",
                "python3": "#!/bin/sh\n[ \"$PYTHON_MANAGER_AUTOMATIC_INSTALL\" = false ] || exit 1\n"
                           "[ -z \"${PYLAUNCHER_ALLOW_INSTALL+x}${PYLAUNCHER_ALWAYS_INSTALL+x}\" ] || exit 1\n"
                           "printf 'ready\\n'\n",
            }.items():
                target = root / name
                target.write_text(source, encoding="utf-8")
                target.chmod(0o755)
            fixture_path = directory.replace("\\", "/")
            if os.name == "nt":
                fixture_path = "/" + fixture_path[0].lower() + fixture_path[2:]
            env = {**os.environ, "PATH": fixture_path + ":/usr/bin:/bin",
                   "PYLAUNCHER_ALLOW_INSTALL": "1", "PYLAUNCHER_ALWAYS_INSTALL": "1"}
            value = read_result([SH, (ROOT / "hooks/check-runtime.sh").as_posix(), "--json"], env)
            self.assertEqual(value["node"], "ready")
            self.assertEqual(value["python"], "ready")


if __name__ == "__main__":
    unittest.main()

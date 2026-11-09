import importlib.util
from pathlib import Path
import tempfile
import unittest
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("repo_check", ROOT / "scripts/check.py")
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)


class ValidationTests(unittest.TestCase):
    def test_portable_schema_rejects_host_fields_and_wrong_nested_types(self):
        schema = checks.read_json(ROOT / "scripts/schemas/agent-plugins-1.0.0.schema.json")
        valid = checks.read_json(ROOT / "plugin.json")
        checks.validate_schema(valid, schema)
        for change in [{"skills": "./skills/"}, {"extensions": {"com.openai": "invalid"}}, {"name": "Invalid Name"}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                checks.validate_schema({**valid, **change}, schema)

    def test_schema_evaluator_never_silently_ignores_new_keywords(self):
        with self.assertRaisesRegex(ValueError, "unsupported"):
            checks.validate_schema({}, {"allOf": []})

    def test_nested_markdown_example_requires_longer_outer_fence(self):
        bad = "```markdown\n# State\n```yaml\nuser: missing\n```\n```\n"
        with self.assertRaisesRegex(ValueError, "longer outer"):
            list(checks.markdown_parts(bad, "example.md"))
        good = "````markdown\n# State\n```yaml\nuser: missing\n```\n````\n"
        self.assertEqual(len(list(checks.markdown_parts(good, "example.md"))), 1)

    def test_unclosed_fences_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "unclosed"):
            list(checks.markdown_parts("```text\nunfinished", "example.md"))

    def test_version_drift_and_codex_marketplace_in_claude_file_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="relayforge-metadata-") as directory:
            root = Path(directory)
            for name in ["plugin.json", ".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json"]:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / name, target)
            (root / "skills").mkdir()
            checks.check_metadata(root)
            codex = root / ".codex-plugin/plugin.json"
            original = codex.read_text()
            data = json.loads(original)
            data["version"] = "9.9.9"
            codex.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, "version differs"):
                checks.check_metadata(root)
            codex.write_text(original)
            shutil.copyfile(root / ".agents/plugins/marketplace.json", root / ".claude-plugin/marketplace.json")
            with self.assertRaisesRegex(ValueError, "relative path string"):
                checks.check_metadata(root)


if __name__ == "__main__":
    unittest.main()

"""Usage declarations stay bounded, incremental and separate from load evidence."""
from pathlib import Path
import tempfile
import unittest

from progress_panel.protocol import tools, validate
from progress_panel.state import ProgressError, ProgressStore


class SkillUseTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.store = ProgressStore(Path(temp.name) / "cache")
        self.active = [{"label": "Clarify", "status": "active"}]
        self.start = {"title": "Example", "scope": {"kind": "stage_delivery", "target_stage": "clarifying"}, "steps": self.active}
        self.source = {"source_state": {"status": "available"}, "product": {}}

    def start_run(self, uses):
        return self.store.start({**self.start, "skill_uses": uses}, self.source, {})

    def update(self, run, **kwargs):
        return self.store.update({"run_id": run["run_id"], "expected_revision": run["revision"],
                                  "status": "running", "steps": self.active, **kwargs}, self.source)

    def test_normalization_channels_preservation_and_legacy(self):
        run = self.start_run([{"skill": "Humanizer-zh", "via": "direct_read"}])
        first = run["skill_uses"][0]
        self.assertEqual(first["skill"], "host:Humanizer-zh")
        run = self.update(run, skill_uses=[{"skill": "host:Humanizer-zh", "via": "direct_read"},
                                          {"skill": "host:Humanizer-zh", "via": "context"}])
        self.assertEqual(run["skill_uses"][0], first)
        self.assertEqual(len(run["history"][-1]["skill_uses"]), 1)
        run = self.update(run, skill_uses=[])
        self.assertEqual(len(run["skill_uses"]), 2)
        self.assertNotIn("skill_uses", run["history"][-1])
        run = self.update(run)
        self.assertEqual(len(run["skill_uses"]), 2)
        self.assertEqual(run["skill_loads"], [])
        self.assertIsNone(run["workflow"])
        del run["skill_uses"]
        with self.store.connection() as connection:
            self.store._write(connection, run)
        run = self.update(run, skill_uses=[{"skill": "plugin:skill", "via": "skill_tool"}])
        self.assertEqual(run["skill_uses"][0]["skill"], "plugin:skill")

    def test_invalid_and_forged_declarations_rejected_by_schema_and_store(self):
        schema = next(t for t in tools() if t["name"] == "start_product_progress")["inputSchema"]["properties"]["skill_uses"]
        valid = {"skill": "host:skill", "via": "context"}
        invalid = [None, {}, [None], [{**valid, "source": "mcp_skill_load"}],
                   [{**valid, "sha256": "a" * 64}], [{**valid, "recorded_at": "now"}],
                   [{**valid, "via": "planned"}], [{**valid, "skill": "../outside"}],
                   [{**valid, "skill": "a:b:c"}], [valid] * 33]
        for uses in invalid:
            with self.subTest(uses=uses):
                with self.assertRaises(ProgressError):
                    validate(uses, schema)
                with self.assertRaises(ProgressError):
                    self.start_run(uses)
        with self.assertRaises(ProgressError):
            self.start_run([{"skill": "skill", "via": "context"}, valid])

    def test_limits_are_atomic_and_conflict_does_not_add_usage(self):
        batch = lambda start, end: [{"skill": f"plugin:skill-{i}", "via": "direct_read"} for i in range(start, end)]
        first = self.start_run(batch(0, 32))
        run = self.update(first, skill_uses=batch(32, 64))
        for stale, uses, code in [(first, batch(64, 65), "revision_conflict"),
                                  (run, batch(64, 65), "skill_use_limit")]:
            with self.assertRaises(ProgressError) as error:
                self.update(stale, skill_uses=uses)
            self.assertEqual(error.exception.code, code)
            self.assertEqual(self.store.read(run["run_id"]), run)
        ended = self.update(run, status="cancelled", outcome="cancelled",
                            steps=[{"label": "Clarify", "status": "skipped"}])
        with self.assertRaises(ProgressError) as error:
            self.update(ended, skill_uses=batch(64, 65))
        self.assertEqual(error.exception.code, "run_ended")

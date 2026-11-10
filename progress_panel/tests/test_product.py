"""Exercise public tools against real product state, never approval declarations."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from progress_panel.server import ProgressServer
from progress_panel.source import HELPER
from progress_panel.source import collect


@unittest.skipUnless(shutil.which("node"), "Product snapshots require Node.js")
class ProductTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.server = ProgressServer(self.root / "cache")
        self.helper("init", "--slug", "search", "--name", "Search", "--request", "Search documents")
        self.state = "docs/relayforge/workflows/search/state.md"
        self.active = [{"label": "PRD", "status": "active"}]
        self.start = {"title": "Search", "scope": {"kind": "product_workflow", "target_stage": None},
                      "source_binding": {"project_root": str(self.project), "state_path": self.state}, "steps": self.active}

    def helper(self, command, *args):
        common = ["--project-dir", str(self.project)]
        if command != "init":
            common += ["--state", self.state]
        result = subprocess.run([shutil.which("node"), str(HELPER), command, *common, *args], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def artifact(self, kind, inputs=""):
        (self.project / f"{kind}.md").write_text(f"# {kind}\n\nArtifact version: v1\nStatus: ready-for-review\n\nBehavior\n")
        return self.helper("register", "--artifact", kind, "--kind", kind, "--path", f"{kind}.md", "--inputs", inputs)

    def approve(self, kind, record, fast=False):
        return self.helper("approve", "--artifact", kind, "--version", record["version"], "--sha256", record["sha256"],
                           "--scope", "Behavior and input scope", "--confirmation", "Confirmed named scope",
                           *(["--include-inputs", "true"] if fast else []))

    def call(self, name, args):
        result = self.server.call_tool(name, args)
        self.assertFalse(result.get("isError"), result)
        return result["structuredContent"]

    def update(self, run, **changes):
        return {"run_id": run["run_id"], "expected_revision": run["revision"], "status": "running", "steps": self.active, **changes}

    def test_only_real_spec_approval_completes_product(self):
        self.artifact("prd")
        run = self.call("start_product_progress", self.start)
        done = self.update(run, status="completed", steps=[{"label": "PRD", "status": "done"}], outcome="product_approved")
        rejected = self.server.call_tool("update_product_progress", done)
        self.assertEqual(rejected["structuredContent"]["error"], "product_not_approved")
        record = self.helper("snapshot")["product"]["artifacts"][0]
        self.approve("prd", record)
        spec = self.artifact("spec", "prd")
        self.approve("spec", spec)
        result = self.call("update_product_progress", done)
        self.assertEqual(result["status"], "completed")
        read = self.call("read_product_progress", {"run_id": run["run_id"]})
        self.assertEqual(read["outcome"], "product_approved")
        self.assertNotIn("_binding", read)
        # Response-loss retry is safe, including after reaching the terminal state.
        self.assertEqual(self.call("update_product_progress", done)["revision"], 2)
        (self.project / "prd.md").write_text("Changed scope")
        error = self.server.call_tool("open_product_progress", {"run_id": run["run_id"]})
        self.assertEqual(error["structuredContent"]["error"], "new_attempt_required")
        self.assertEqual(self.call("read_product_progress", {"run_id": run["run_id"]})["revision"], 2)

    def test_fast_approval_does_not_approve_inputs(self):
        self.helper("mode", "--mode", "fast")
        self.artifact("prd")
        spec = self.artifact("spec", "prd")
        run = self.call("start_product_progress", self.start)
        request = {"target_kind": "spec", "artifact_id": "spec", "version": spec["version"],
                   "sha256": spec["sha256"], "scope_summary": "Behavior, PRD goals and scope", "included_inputs": spec["inputs"]}
        waiting = self.call("update_product_progress", self.update(run, status="waiting", details={"waiting_for": "user", "reason": "Confirm spec v1 and input scope"}, confirmation_request=request))
        self.assertIsNotNone(waiting["confirmation_request"])
        self.approve("spec", spec, fast=True)
        self.call("update_product_progress", self.update(waiting, status="completed", steps=[{"label":"PRD", "status":"done"}], outcome="product_approved"))
        view = self.call("read_product_progress", {"run_id": run["run_id"]})
        self.assertEqual(next(a for a in view["product"]["artifacts"] if a["kind"] == "prd")["effective_status"], "ready-for-review")
        self.assertIsNone(view["confirmation_request"])
        self.assertNotIn("confirmation_invalidated",view)

    def test_stage_delivery_is_not_product_completion(self):
        self.artifact("prd")
        start = {**self.start, "scope": {"kind": "stage_delivery", "target_stage": "prd"}}
        run = self.call("start_product_progress", start)
        self.call("update_product_progress", self.update(run, status="completed", steps=[{"label":"PRD", "status":"done"}], outcome="stage_delivered"))
        self.assertEqual(self.helper("snapshot")["product"]["current_stage"], "prd")

    def test_read_only_polling_and_source_failure_cannot_invent_approval(self):
        self.artifact("prd")
        run = self.call("start_product_progress", self.start)
        before = (self.project / self.state).read_bytes()
        with patch("progress_panel.server.collect", side_effect=AssertionError("poll collected source")):
            self.call("read_product_progress", {"run_id": run["run_id"]})
        self.assertEqual((self.project / self.state).read_bytes(), before)
        with patch("progress_panel.server.collect", return_value={"source_state": {"status":"unavailable", "error_code":"node_unavailable"}}):
            updated = self.call("update_product_progress", self.update(run))
        self.assertEqual(updated["source_state"]["status"], "unavailable")
        self.assertTrue(updated["source_state"]["retained_snapshot"])

    def test_confirmation_rejects_stale_hash_and_is_cleared_on_source_change(self):
        record = self.artifact("prd")
        run = self.call("start_product_progress", self.start)
        request = {"target_kind":"prd", "artifact_id":"prd", "version":record["version"], "sha256":record["sha256"], "scope_summary":"Goals and scope", "included_inputs":[]}
        args = self.update(run, status="waiting", details={"waiting_for":"user"}, confirmation_request={**request, "sha256":"0"*64})
        self.assertTrue(self.server.call_tool("update_product_progress", args)["isError"])
        args["confirmation_request"] = request
        waiting = self.call("update_product_progress", args)
        (self.project / "prd.md").write_text("Changed")
        updated = self.call("update_product_progress", self.update(waiting, status="waiting", details={"waiting_for":"user"}))
        self.assertIsNone(updated["confirmation_request"])

    def test_conflicts_closed_arguments_and_real_load_receipts(self):
        run = self.call("start_product_progress", self.start)
        loaded = self.call("load_product_skill", {"run_id":run["run_id"], "expected_revision":1, "skill":"using-relayforge-product"})
        self.assertEqual(loaded["revision"], 2)
        error = self.server.call_tool("update_product_progress", self.update(run))
        self.assertEqual(error["structuredContent"]["error"], "revision_conflict")
        self.assertNotIn("_binding", error["structuredContent"]["current"])
        for extra in [{"product":{"approved":True}}, {"source":"verified"}, {"skill_loads":[]}]:
            self.assertTrue(self.server.call_tool("start_product_progress", {**self.start, **extra})["isError"])
        self.assertTrue(self.server.call_tool("load_product_skill", {"run_id":run["run_id"], "expected_revision":2, "skill":"../outside"})["isError"])

    def test_isolation_and_no_latest_lookup(self):
        first = self.call("start_product_progress", self.start)
        second = self.call("start_product_progress", self.start)
        self.assertNotEqual(first["run_id"], second["run_id"])
        self.assertEqual(self.call("read_product_progress", {"run_id":first["run_id"]})["revision"], 1)
        self.assertTrue(self.server.call_tool("read_product_progress", {})["isError"])
        self.assertTrue(self.server.call_tool("start_product_progress", {**self.start,"source_binding":{"project_root":str(self.project),"state_path":"../outside.md"}})["isError"])

    def test_source_runtime_failures_are_bounded_and_explicit(self):
        with patch("progress_panel.source.shutil.which",return_value=None):
            self.assertEqual(collect(self.start["source_binding"])["source_state"]["error_code"],"node_unavailable")
        with patch("progress_panel.source.subprocess.run",side_effect=subprocess.TimeoutExpired("node",5)):
            self.assertEqual(collect(self.start["source_binding"])["source_state"]["error_code"],"source_timeout")

    def test_history_is_bounded_and_source_reopens_do_not_rewrite_action_time(self):
        self.artifact("prd")
        run=self.call("start_product_progress",self.start)
        opened=self.call("open_product_progress",{"run_id":run["run_id"]})
        self.assertEqual(opened["revision"],1)
        (self.project/"prd.md").write_text("Changed scope")
        changed=self.call("open_product_progress",{"run_id":run["run_id"]})
        self.assertEqual(changed["revision"],2)
        self.assertEqual(changed["updated_at"],run["updated_at"])
        for number in range(21):
            changed=self.call("update_product_progress",self.update(changed,summary=f"Milestone {number}"))
        read=self.call("read_product_progress",{"run_id":run["run_id"]})
        self.assertEqual(len(read["history"]),20)


if __name__ == "__main__":
    unittest.main()

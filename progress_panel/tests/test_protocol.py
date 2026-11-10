import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from progress_panel.server import ProgressServer, data_directory


class ProtocolTests(unittest.TestCase):
    def test_actual_stdio_discovery_resource_and_closed_tool_errors(self):
        messages = [
            {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}},
            {"jsonrpc":"2.0","id":2,"method":"tools/list"},
            {"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"ui://relayforge-product/progress-v1.html"}},
            {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_product_progress","arguments":{"latest":True}}},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run([sys.executable,"-m","progress_panel.server","--data-dir",str(Path(tmp)/"unused")],
                                    input="".join(json.dumps(m)+"\n" for m in messages),capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            rows = [json.loads(line) for line in result.stdout.splitlines()]
            self.assertEqual(rows[0]["result"]["serverInfo"]["name"],"relayforge-product-progress")
            tools = rows[1]["result"]["tools"]
            self.assertEqual(len(tools),5)
            self.assertEqual(next(t for t in tools if t["name"]=="read_product_progress")["_meta"]["ui"]["visibility"],["app"])
            resource = rows[2]["result"]["contents"][0]
            self.assertEqual(resource["_meta"]["openai/ui"]["availableDisplayModes"],["inline"])
            self.assertNotIn("entrypoints",resource["_meta"]["openai/ui"])
            self.assertIn("RelayForge Product Progress",resource["text"])
            self.assertTrue(rows[3]["result"]["isError"])
            self.assertFalse((Path(tmp)/"unused").exists())

    def test_duplicate_json_and_oversized_requests_do_not_crash_transport(self):
        with tempfile.TemporaryDirectory() as tmp:
            server=ProgressServer(Path(tmp)/"unused")
            source=io.BytesIO(b'{"jsonrpc":"2.0","id":1,"id":2,"method":"ping"}\n'+b'X'*17000+b'\n'+b'{"jsonrpc":"2.0","id":3,"method":"ping"}\n')
            target=io.BytesIO();server.serve(source,target)
            rows=[json.loads(line) for line in target.getvalue().splitlines()]
            self.assertIn("error",rows[0]);self.assertIn("error",rows[1]);self.assertEqual(rows[2]["id"],3)

    def test_product_data_is_isolated_from_development(self):
        with patch.dict(os.environ,{"PLUGIN_DATA":"/tmp/managed"},clear=True):
            self.assertEqual(data_directory(),Path("/tmp/managed/product-progress-panel"))
        with patch.dict(os.environ,{"RELAYFORGE_PRODUCT_PROGRESS_DATA_DIR":"/tmp/isolated"},clear=True):
            self.assertEqual(data_directory(),Path("/tmp/isolated"))
        with patch.dict(os.environ,{},clear=True), patch("sys.platform","darwin"):
            self.assertEqual(data_directory().name,"product-progress-panel")
        with patch.dict(os.environ,{"XDG_STATE_HOME":"/tmp/state"},clear=True),patch("sys.platform","linux"):
            self.assertEqual(data_directory(),Path("/tmp/state/relayforge-product/progress-panel"))


if __name__ == "__main__":unittest.main()

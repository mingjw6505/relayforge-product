#!/usr/bin/env python3
"""Offline repository checks. No plugin runtime dependencies or network access.

YAML uses an existing PyYAML installation or Ruby's standard YAML library.
The small schema evaluator covers every assertion in the pinned Agent Plugins
1.0.0 schema and fails on unsupported schema keywords instead of skipping them.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED = {"$schema", "$id", "title", "description", "type", "properties", "required",
             "additionalProperties", "items", "const", "enum", "minLength", "maxLength", "pattern"}


def validate_schema(value, schema, location="$"):
    unsupported = set(schema) - SUPPORTED
    if unsupported:
        raise ValueError(f"{location}: unsupported schema keywords {unsupported}")
    types = {"object": dict, "array": list, "string": str, "boolean": bool}
    if "type" in schema and not isinstance(value, types[schema["type"]]):
        raise ValueError(f"{location}: expected {schema['type']}")
    if "const" in schema and value != schema["const"]:
        raise ValueError(f"{location}: expected {schema['const']!r}")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{location}: unexpected value {value!r}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0) or len(value) > schema.get("maxLength", sys.maxsize):
            raise ValueError(f"{location}: invalid string length")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            raise ValueError(f"{location}: invalid string {value!r}")
    if isinstance(value, dict):
        missing = set(schema.get("required", [])) - set(value)
        if missing:
            raise ValueError(f"{location}: missing fields {missing}")
        properties = schema.get("properties", {})
        for key, item in value.items():
            child = properties.get(key, schema.get("additionalProperties", {}))
            if child is False:
                raise ValueError(f"{location}: unexpected field {key}")
            if isinstance(child, dict):
                validate_schema(item, child, f"{location}.{key}")
    if isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value):
            validate_schema(item, schema["items"], f"{location}[{i}]")


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def check_metadata(root):
    portable = read_json(root / "plugin.json")
    schema = read_json(ROOT / "scripts/schemas/agent-plugins-1.0.0.schema.json")
    validate_schema(portable, schema, "plugin.json")
    shared = ["name", "version", "description"]
    for name in [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]:
        manifest = read_json(root / name)
        for field in shared:
            if manifest.get(field) != portable.get(field):
                raise ValueError(f"{name}: {field} differs from root plugin.json")
    if not re.fullmatch(r"\d+\.\d+\.\d+", portable["version"]):
        raise ValueError("Plugin version must be major.minor.patch")
    codex = read_json(root / ".codex-plugin/plugin.json")
    if "$schema" in codex or codex.get("skills") != "./skills/":
        raise ValueError("Codex compatibility manifest must omit the portable $schema and declare ./skills/")
    claude = read_json(root / ".claude-plugin/plugin.json")
    if not isinstance(claude.get("author"), dict) or not claude["author"].get("name"):
        raise ValueError("Claude plugin author.name is required by this repository")
    codex_market = read_json(root / ".agents/plugins/marketplace.json")
    claude_market = read_json(root / ".claude-plugin/marketplace.json")
    for label, market in [("Codex", codex_market), ("Claude", claude_market)]:
        if not isinstance(market.get("name"), str) or not isinstance(market.get("plugins"), list) or not market["plugins"]:
            raise ValueError(f"{label} marketplace requires name and nonempty plugins")
        for plugin in market["plugins"]:
            if plugin.get("name") != portable["name"]:
                raise ValueError(f"{label} marketplace entry does not match the plugin name")
            source = plugin.get("source")
            if label == "Claude":
                if source != "./":
                    raise ValueError("Claude root plugin source must be the relative path string ./")
                if "policy" in plugin:
                    raise ValueError("Codex policy metadata does not belong in the Claude marketplace")
            elif source != {"source": "local", "path": "./"}:
                raise ValueError("Codex marketplace must point to the root local plugin")
    if not isinstance(claude_market.get("owner"), dict) or not claude_market["owner"].get("name"):
        raise ValueError("Claude marketplace requires owner.name")
    if "interface" in claude_market or "$schema" in claude_market:
        raise ValueError("Claude marketplace must not claim the Codex marketplace format")
    if codex_market["name"] != claude_market["name"]:
        raise ValueError("Marketplace names differ across hosts")
    if not (root / "skills").is_dir():
        raise ValueError("Portable skill discovery requires root skills/")
    return portable["version"]


def load_yaml(text):
    if importlib.util.find_spec("yaml"):
        import yaml

        class UniqueLoader(yaml.SafeLoader):
            pass

        def mapping(loader, node):
            pairs = loader.construct_pairs(node, deep=True)
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError(f"Duplicate YAML key: {key}")
                result[key] = value
            return result

        UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
        return yaml.load(text, Loader=UniqueLoader)
    if shutil.which("ruby"):
        result = subprocess.run(["ruby", "-e", 'require "yaml"; require "json"; puts JSON.generate(YAML.safe_load(STDIN.read))'],
                                input=text, text=True, encoding="utf-8", capture_output=True, check=True)
        return json.loads(result.stdout)
    raise ValueError("YAML validation needs an existing PyYAML installation or Ruby; no dependencies were installed")


def markdown_parts(text, label):
    """Yield (language, code) while rejecting malformed/nested fence closures."""
    fence = None
    code = []
    for number, line in enumerate(text.splitlines(), 1):
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if not marker:
            if fence:
                code.append(line)
            continue
        run, rest = marker.groups()
        if not fence:
            fence = (run[0], len(run), rest.strip(), number)
            code = []
        elif run[0] == fence[0] and len(run) >= fence[1]:
            if rest.strip():
                raise ValueError(f"{label}:{number}: nested fence needs a longer outer fence")
            yield fence[2], "\n".join(code)
            fence = None
        else:
            code.append(line)
    if fence:
        raise ValueError(f"{label}:{fence[3]}: unclosed code fence")


def check_documents(root):
    yaml_count = 0
    for skill in sorted((root / "skills").glob("*/SKILL.md")):
        text = skill.read_text(encoding="utf-8-sig")
        front = re.match(r"\A---\s*\n(.*?)\n---\s*(?:\n|$)", text, re.S)
        if not front:
            raise ValueError(f"{skill}: missing YAML front matter")
        data = load_yaml(front[1])
        if not isinstance(data, dict) or data.get("name") != skill.parent.name or not isinstance(data.get("description"), str) or not data["description"].strip():
            raise ValueError(f"{skill}: name must match its directory and description must be nonempty")
        if "disable-model-invocation" in data and not isinstance(data["disable-model-invocation"], bool):
            raise ValueError(f"{skill}: disable-model-invocation must be a boolean")
        yaml_count += 1
        ui_file = skill.parent / "agents/openai.yaml"
        if ui_file.exists():
            ui = load_yaml(ui_file.read_text(encoding="utf-8"))
            if not isinstance(ui, dict) or not isinstance(ui.get("interface"), dict):
                raise ValueError(f"{ui_file}: missing interface mapping")
            if not all(isinstance(ui["interface"].get(field), str) and ui["interface"][field].strip() for field in ["display_name", "short_description"]):
                raise ValueError(f"{ui_file}: missing display name or short description")
            implicit = ui.get("policy", {}).get("allow_implicit_invocation", True)
            if not isinstance(implicit, bool) or bool(data.get("disable-model-invocation", False)) == implicit:
                raise ValueError(f"{ui_file}: invocation policy differs from SKILL.md")
            yaml_count += 1
    for document in [root / "README.md", root / "AGENTS.md", *(root / "docs").rglob("*.md"), *(root / "skills").rglob("*.md")]:
        text = document.read_text(encoding="utf-8-sig")
        for language, code in markdown_parts(text, str(document.relative_to(root))):
            if language in {"yaml", "yml"}:
                load_yaml(code)
            elif language == "json":
                json.loads(code)
        # Fenced examples may describe future files; check actual document links.
        without_code = re.sub(r"(?ms)^(`{3,}|~{3,}).*?^\1\s*$", "", text)
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", without_code):
            target = target.strip("<>").split("#", 1)[0]
            if not target or re.match(r"[a-z]+:", target) or any(c in target for c in "<>{}"):
                continue
            if not (document.parent / unquote(target)).exists():
                raise ValueError(f"{document}: missing local link {target}")
    return yaml_count


def check_progress(root):
    """Validate both registrations and shipped resources without starting a service."""
    portable = read_json(root / "mcp.json")
    native = read_json(root / ".mcp.json")
    if portable.get("$schema") != "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json":
        raise ValueError("Portable MCP schema is required")
    expected = {"command": "node", "args": ["progress_panel/launch.cjs"], "cwd": "./"}
    key = "relayforge-product-progress"
    if portable != {"$schema": portable["$schema"], "mcpServers": {key: {"type": "stdio", **expected}}}:
        raise ValueError("Unexpected portable product MCP registration")
    if native != {"mcpServers": {key: expected}}:
        raise ValueError("Native product MCP registration differs")
    manifest = read_json(root / "plugin.json")
    if manifest.get("extensions", {}).get("com.openai", {}).get("mcpServers") != "./.mcp.json":
        raise ValueError("Portable OpenAI compatibility MCP reference is missing")
    for name in [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]:
        if read_json(root / name).get("mcpServers") != "./.mcp.json":
            raise ValueError(f"{name}: product MCP reference is missing")
    for name in ["launch.cjs", "server.py", "state.py", "source.py", "skills.py", "protocol.py", "static/panel.html", "THIRD_PARTY_NOTICES.txt"]:
        if not (root / "progress_panel" / name).is_file():
            raise ValueError(f"Missing product panel file: {name}")
    if not (root / "skills/using-relayforge-product/scripts/panel-runtime.cjs").is_file():
        raise ValueError("Missing product panel runtime selector")
    html = (root / "progress_panel/static/panel.html").read_text(encoding="utf-8")
    if ("RelayForge Product Progress" not in html or "read_product_progress" not in html or
            "{{" in html or f'"{manifest["version"]}"' not in html):
        raise ValueError("Bundled product panel is missing, stale, or not built")


def check_startup(root):
    reference = "./hooks/codex-runtime.json"
    if read_json(root / "plugin.json").get("extensions", {}).get("com.openai", {}).get("hooks") != reference:
        raise ValueError("Portable native startup hook reference is missing")
    if read_json(root / ".codex-plugin/plugin.json").get("hooks") != reference:
        raise ValueError("Codex native startup hook reference differs")
    definition = read_json(root / reference)
    groups = definition.get("hooks", {})
    if set(groups) != {"SessionStart"} or len(groups["SessionStart"]) != 1:
        raise ValueError("Startup check must not add unrelated lifecycle hooks")
    group = groups["SessionStart"][0]
    handler = group["hooks"][0]
    if (group.get("matcher") != "^(startup|clear)$" or len(group["hooks"]) != 1 or
            handler.get("type") != "command" or handler.get("timeout") != 15 or
            not handler.get("command", "").startswith("/bin/sh ") or
            not handler.get("commandWindows", "").startswith("powershell.exe ")):
        raise ValueError("Startup checks must use bounded native OS commands")
    for name in ["check-runtime.ps1", "check-runtime.sh", "python-probe.py", "runtime-notice.json"]:
        if not (root / "hooks" / name).is_file():
            raise ValueError(f"Missing native startup file: {name}")
    if not isinstance(read_json(root / "hooks/runtime-notice.json"), str):
        raise ValueError("Native startup notice must be a JSON string")
    compile((root / "hooks/python-probe.py").read_text(encoding="utf-8"), "python-probe.py", "exec")


def run_checks(root, structure_only=False):
    version = check_metadata(root)
    yaml_count = check_documents(root)
    check_progress(root)
    check_startup(root)
    print(f"Metadata, versions ({version}), {yaml_count} YAML files, Markdown fences and links: passed", flush=True)
    if structure_only:
        return
    node = shutil.which("node")
    if not node:
        raise ValueError("Node.js is required to check helper scripts and run regression tests")
    for script in [*(root / "skills").rglob("*.cjs"), *(root / "skills").rglob("*.js"), root / "progress_panel/launch.cjs"]:
        subprocess.run([node, "--check", str(script)], check=True, cwd=root)
    subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "test", "-p", "test_*.py"], check=True, cwd=root)
    subprocess.run([node, "--test", *map(str, sorted((root / "test").glob("*.test.cjs")))], check=True, cwd=root)
    subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "progress_panel/tests", "-p", "test_*.py"], check=True, cwd=root)
    subprocess.run([node, "--test", *map(str, sorted((root / "progress_panel/web/tests").glob("*.test.mjs")))], check=True, cwd=root)
    claude = shutil.which("claude")
    if claude:
        # Windows npm shims are .cmd files; use their native shell invocation.
        subprocess.run([claude, "plugin", "validate", str(root)], check=True, cwd=root, shell=os.name == "nt")
    else:
        print("Claude CLI not installed: native validation skipped; offline host-format checks passed")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--structure-only", action="store_true")
    args = parser.parse_args()
    try:
        run_checks(ROOT, args.structure_only)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Check failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Closed product-tool schemas and matching runtime validation (no dependencies)."""
from __future__ import annotations

import re
from progress_panel.state import ProgressError, SKILL_ID_PATTERN

RESOURCE_URI = "ui://relayforge-product/progress-v1.html"


def string(limit: int, minimum: int = 1) -> dict:
    return {"type": "string", "minLength": minimum, "maxLength": limit}


def obj(properties: dict, required: list | None = None) -> dict:
    return {"type": "object", "additionalProperties": False, "properties": properties,
            "required": list(properties) if required is None else required}


def enum(*values: str) -> dict:
    return {"type": "string", "enum": list(values)}


STAGES = ("discovery", "clarifying", "prd", "prototype", "spec")
ID = {**string(36), "pattern": r"^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$"}
REV = {"type": "integer", "minimum": 1}
STATUS = enum("running", "waiting", "completed", "blocked", "cancelled")
STEPS = {"type": "array", "minItems": 1, "maxItems": 12, "items": obj({
    "label": string(80), "status": enum("pending", "active", "done", "blocked", "skipped")})}
DETAILS = obj({**{key: string(120, 0) for key in ("current", "change", "remaining", "reason")},
               "waiting_for": enum("user", "external")}, [])
SKILL_USES = {"type": "array", "maxItems": 32, "items": obj({
    "skill": {**string(129), "pattern": SKILL_ID_PATTERN},
    "via": enum("direct_read", "skill_tool", "context")})}
SKILL_USE_GUIDANCE = (
    " Report every other actually read and applied Skill in skill_uses, including external, direct-read and host-provided instructions. "
    "Use namespace:skill-name (host:name for personal/system, project:name for project, plugin-name:name for plugins); bare names mean host:name. "
    "Never report planned or merely discovered Skills. Declarations are not load receipts or execution audits. Omission preserves prior records; flush pending declarations before ending."
)
SCOPE = obj({"kind": enum("product_workflow", "stage_delivery"),
             "target_stage": {"type": ["string", "null"], "enum": [*STAGES, None]}})
BINDING = obj({"project_root": string(4096), "state_path": string(1024)})
INPUT = obj({"artifact": string(64), "version": {**string(40), "pattern": r"^v[1-9]\d*$"},
             "sha256": {**string(64), "pattern": r"^[a-f0-9]{64}$"}})
CONFIRMATION = {**obj({"target_kind": enum("boundary", "decision", "prd", "prototype", "spec"),
                      "artifact_id": {"type": ["string", "null"], "maxLength": 64},
                      "version": INPUT["properties"]["version"], "sha256": INPUT["properties"]["sha256"],
                      "scope_summary": string(600), "included_inputs": {"type": "array", "maxItems": 64, "items": INPUT}}),
                "type": ["object", "null"]}


def tools() -> list[dict]:
    render = {"ui": {"resourceUri": RESOURCE_URI, "visibility": ["model"]}}
    definitions = [
        ("start_product_progress", "创建产品进度卡片",
         "Create one inline product-progress card after selecting an existing requirement. Bind its project and state file. No source writes or approvals. Keep the returned run_id and revision." + SKILL_USE_GUIDANCE,
         obj({"title": string(80), "scope": SCOPE, "source_binding": BINDING, "steps": STEPS,
              "summary": string(240, 0), "details": {**DETAILS, "type": ["object", "null"]}, "previous_run_id": ID,
              "skill_uses": SKILL_USES},
             ["title", "scope", "source_binding", "steps"]), False, False, render),
        ("update_product_progress", "更新产品进度",
         "Declare a real milestone with the latest revision. Product facts are imported read-only, never caller-declared. Waiting confirmation binds one version/hash/scope; terminal outcome distinguishes stage delivery from approved product completion." + SKILL_USE_GUIDANCE,
         obj({"run_id": ID, "expected_revision": REV, "status": STATUS, "steps": STEPS,
              "summary": string(240, 0), "details": {**DETAILS, "type": ["object", "null"]},
              "confirmation_request": CONFIRMATION,
              "skill_uses": SKILL_USES,
              "outcome": enum("stage_delivered", "product_approved", "cancelled", "blocked")},
             ["run_id", "expected_revision", "status", "steps"]), False, True, {"ui": {"visibility": ["model"]}}),
        ("load_product_skill", "加载产品 Skill",
         "Actually read one selected bundled product SKILL.md and record its SHA-256 receipt. Apply the returned instructions. Loaded never means executed or approved; do not reload unchanged instructions or recursively load the same skill.",
         obj({"run_id": ID, "expected_revision": REV, "skill": {**string(64), "pattern": r"^[a-z0-9][a-z0-9-]{0,63}$"}}),
         False, True, {"ui": {"visibility": ["model"]}}),
        ("open_product_progress", "重新显示产品进度",
         "Reopen this known run only when requested, rechecking its bound source. Never use to refresh. Changed terminal sources require a new attempt; source files are never written.",
         obj({"run_id": ID}), False, True, render),
        ("read_product_progress", "读取绑定产品进度",
         "Read only the cache of the exact bound run. No filesystem collection, latest-task lookup, source writes or logs.",
         obj({"run_id": ID}), True, True, {"ui": {"visibility": ["app"]}}),
    ]
    return [{"name": name, "title": title, "description": description, "inputSchema": schema,
             "annotations": {"readOnlyHint": read_only, "destructiveHint": False,
                             "idempotentHint": idempotent, "openWorldHint": False}, "_meta": meta}
            for name, title, description, schema, read_only, idempotent, meta in definitions]


def validate(value: object, schema: dict) -> None:
    kinds = {"object": dict, "array": list, "string": str, "integer": int, "null": type(None)}
    types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
    if not any(type(value) is kinds[kind] for kind in types):
        raise ProgressError("invalid_arguments")
    if "enum" in schema and value not in schema["enum"]:
        raise ProgressError("invalid_arguments")
    if value is None:
        return
    if isinstance(value, dict):
        if set(value) - set(schema["properties"]) or set(schema["required"]) - set(value):
            raise ProgressError("invalid_arguments")
        for key, item in value.items():
            validate(item, schema["properties"][key])
    elif isinstance(value, list):
        if not schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", 100):
            raise ProgressError("invalid_arguments")
        for item in value:
            validate(item, schema["items"])
    elif isinstance(value, str):
        if (not schema.get("minLength", 0) <= len(value) <= schema.get("maxLength", 4096) or
                ("pattern" in schema and not re.fullmatch(schema["pattern"], value)) or
                any(ord(c) < 32 or ord(c) == 127 for c in value)):
            raise ProgressError("invalid_arguments")
    elif value < schema.get("minimum", 0):
        raise ProgressError("invalid_arguments")

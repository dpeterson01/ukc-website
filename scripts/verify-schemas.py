#!/usr/bin/env python3
"""Cross-check the form schemas against what the engine actually supports.

Catches the mistakes a JSON parse cannot: a block that does not exist, a field
type the renderer has no branch for, a showIf pointing at a field that is not
its sibling, a duplicate id.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOCKS = ROOT / "site/forms/blocks/blocks.json"
SCHEMAS = sorted((ROOT / "site/forms/schemas").glob("*.json"))

# Every type with a branch in renderer.js, plus the plain input types
# validate.js knows how to check.
FIELD_TYPES = {
    "text", "email", "tel", "zip", "state", "number", "date", "textarea",
    "select", "radio", "checkbox", "checkboxes", "block", "repeat", "static",
    "review", "signature",
}
CHECK_TYPES = {"person", "personEach", "contactMethods", "gradeAge"}
COND_OPS = {"equals", "notEquals", "in", "notIn", "isBlank"}

problems = []
notes = []


def fail(where, msg):
    problems.append(f"{where}: {msg}")


def walk_condition(cond, where, siblings):
    if not isinstance(cond, dict):
        return
    for key in ("all", "any"):
        if key in cond:
            for sub in cond[key]:
                walk_condition(sub, where, siblings)
            return
    if "not" in cond:
        walk_condition(cond["not"], where, siblings)
        return
    field = cond.get("field")
    if field is None:
        fail(where, f"showIf has no field and no all/any/not: {cond}")
        return
    if not any(op in cond for op in COND_OPS):
        notes.append(f"{where}: showIf on '{field}' has no operator, treated as 'is not blank'")
    root = field.split(".")[0]
    if siblings is not None and root not in siblings:
        fail(where, f"showIf points at '{field}', which is not among its siblings {sorted(siblings)}")


def field_ids(fields):
    out = set()
    for f in fields:
        if not isinstance(f, dict):
            continue
        fid = f.get("id")
        if fid:
            out.add(fid)
        # A block referenced with id null merges its children into this scope.
        if f.get("type") == "block" and f.get("id") is None:
            blk = blocks.get(f.get("block"))
            if blk:
                out |= field_ids(blk.get("fields", []))
    return out


def check_fields(fields, where, blocks):
    siblings = field_ids(fields)
    seen = set()
    # Blocks deliberately share an id to compose one namespace: the 'adult' and
    # 'contact' blocks both write under 'spouse'. That is fine as long as the
    # leaf names underneath do not collide.
    block_leaves = {}
    for f in fields:
        if not isinstance(f, dict):
            fail(where, f"field is not an object: {f!r}")
            continue
        ftype = f.get("type", "text")
        fid = f.get("id")
        if ftype not in FIELD_TYPES:
            fail(where, f"unknown field type '{ftype}' on id '{fid}'")
        if ftype in ("block", "repeat"):
            name = f.get("block")
            if name not in blocks:
                fail(where, f"references block '{name}', which is not defined")
            else:
                leaves = field_ids(blocks[name].get("fields", []))
                clash = leaves & block_leaves.get(fid, set())
                if clash:
                    fail(where, f"blocks sharing id '{fid}' both define {sorted(clash)}")
                block_leaves[fid] = block_leaves.get(fid, set()) | leaves
                check_fields(blocks[name].get("fields", []),
                             f"{where} > block:{name}", blocks)
        elif fid is not None:
            if fid in seen:
                fail(where, f"duplicate field id '{fid}'")
            seen.add(fid)
        if ftype in ("radio", "select", "checkboxes"):
            opts = f.get("options")
            if not opts:
                fail(where, f"'{fid}' is a {ftype} with no options")
            else:
                vals = [o.get("value") for o in opts]
                if len(vals) != len(set(vals)):
                    fail(where, f"'{fid}' has duplicate option values")
        if "showIf" in f:
            walk_condition(f["showIf"], f"{where} > {fid}.showIf", siblings)
        if f.get("required") and ftype == "static":
            fail(where, f"static field '{fid}' cannot be required")


blocks = json.loads(BLOCKS.read_text())
blocks = {k: v for k, v in blocks.items() if not k.startswith("_")}

for name, blk in blocks.items():
    check_fields(blk.get("fields", []), f"blocks/{name}", blocks)

for path in SCHEMAS:
    schema = json.loads(path.read_text())
    sid = schema.get("formId", path.stem)
    for key in ("formId", "version", "title", "subjectPrefix", "steps"):
        if key not in schema:
            fail(sid, f"schema is missing required key '{key}'")
    if schema.get("formId") != path.stem:
        fail(sid, f"formId '{schema.get('formId')}' does not match filename '{path.stem}'")

    step_ids = set()
    all_step_field_ids = {}
    for step in schema.get("steps", []):
        stid = step.get("id")
        if stid in step_ids:
            fail(sid, f"duplicate step id '{stid}'")
        step_ids.add(stid)
        where = f"{sid}/{stid}"
        if not step.get("fields"):
            fail(where, "step has no fields")
        check_fields(step.get("fields", []), where, blocks)
        all_step_field_ids[stid] = field_ids(step.get("fields", []))
        if "showIf" in step:
            walk_condition(step["showIf"], f"{where}.showIf", None)
        for check in step.get("checks", []):
            ctype = check.get("type")
            if ctype not in CHECK_TYPES:
                fail(where, f"unknown check type '{ctype}'")
            if ctype == "gradeAge":
                for k in ("repeat", "birthdate", "grade"):
                    if k not in check:
                        fail(where, f"gradeAge check is missing '{k}'")
            if ctype == "contactMethods" and not check.get("paths"):
                fail(where, "contactMethods check has no paths")

    if not any(f.get("type") == "review"
               for s in schema["steps"] for f in s.get("fields", [])):
        notes.append(f"{sid}: no review step")
    if not any(f.get("type") == "signature"
               for s in schema["steps"] for f in s.get("fields", [])):
        notes.append(f"{sid}: no signature field")

for n in notes:
    print("note:", n)
if problems:
    print()
    for p in problems:
        print("PROBLEM:", p)
    print(f"\n{len(problems)} problem(s)")
    sys.exit(1)

print(f"\nAll {len(SCHEMAS)} schemas and {len(blocks)} blocks check out.")

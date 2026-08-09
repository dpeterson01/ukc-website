#!/usr/bin/env python3
"""Pulls every translatable string out of the schemas and blocks.

Writes one file per form into site/forms/i18n/, keyed by a stable path. Run it
again after changing a schema and it keeps the Spanish already written, adds
keys for anything new, and drops keys for anything removed. So the diff after a
schema change is exactly the translation work that change created.

    python3 scripts/extract-form-strings.py          # update the files
    python3 scripts/extract-form-strings.py --report # coverage only, no writes
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "site" / "forms" / "schemas"
BLOCKS = ROOT / "site" / "forms" / "blocks" / "blocks.json"
OUT = ROOT / "site" / "forms" / "i18n"
LANGS = ["es"]

# Keys whose values a parishioner reads. `html` is included because the static
# blocks carry the consent and release wording, which is the part that most
# needs to be in someone's own language.
TEXT_KEYS = {"label", "help", "title", "placeholder", "html", "legend",
             "itemLabel", "addLabel", "successTitle", "successBody", "message",
             "subtitle", "sameAsLabel"}


def walk_fields(fields, prefix, out):
    for field in fields or []:
        fid = field.get("id") or field.get("block") or "?"
        base = f"{prefix}.{fid}"
        for key in TEXT_KEYS:
            if isinstance(field.get(key), str) and field[key].strip():
                out[f"{base}.{key}"] = field[key]
        # `options` is a choice list on a radio or select, and a bag of
        # interpolation variables on a block reference. Both can hold words a
        # person reads: the second gets injected into a label, so an English
        # value there leaves an English word inside a Spanish sentence.
        options = field.get("options")
        if isinstance(options, list):
            for i, option in enumerate(options):
                if not isinstance(option, dict):
                    continue
                value = option.get("value", i)
                if isinstance(option.get("label"), str):
                    out[f"{base}.option.{value}"] = option["label"]
                if isinstance(option.get("help"), str) and option["help"].strip():
                    out[f"{base}.option.{value}.help"] = option["help"]
        elif isinstance(options, dict):
            for key, value in options.items():
                if isinstance(value, str) and value.strip():
                    out[f"{base}.var.{key}"] = value


def extract_schema(path):
    schema = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for key in ("title", "successTitle", "successBody", "submitLabel"):
        if isinstance(schema.get(key), str) and schema[key].strip():
            out[f"form.{key}"] = schema[key]
    for step in schema.get("steps", []):
        sid = step.get("id", "?")
        for key in ("title", "help"):
            if isinstance(step.get(key), str) and step[key].strip():
                out[f"step.{sid}.{key}"] = step[key]
        for check in step.get("checks") or []:
            if isinstance(check.get("message"), str):
                out[f"step.{sid}.check.{check.get('type', '?')}"] = check["message"]
        walk_fields(step.get("fields"), f"step.{sid}", out)
    return out


def extract_blocks():
    blocks = json.loads(BLOCKS.read_text(encoding="utf-8"))
    out = {}
    for name, block in blocks.items():
        if name.startswith("_") or not isinstance(block, dict):
            continue
        walk_fields(block.get("fields"), f"block.{name}", out)
        for key, value in (block.get("defaults") or {}).items():
            if isinstance(value, str) and key.endswith("Label"):
                out[f"block.{name}.default.{key}"] = value
    return out


def merge(english, existing):
    """Keep what is translated, add what is new, drop what is gone."""
    return {key: existing.get(key, "") for key in english}


def main():
    report_only = "--report" in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)

    sources = {path.stem: extract_schema(path) for path in sorted(SCHEMAS.glob("*.json"))}
    sources["blocks"] = extract_blocks()

    # The English side is written out too, so a translator has both columns in
    # front of them without opening the schema.
    for name, english in sources.items():
        (OUT / f"{name}.en.json").write_text(
            json.dumps(english, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    total = done = 0
    for lang in LANGS:
        for name, english in sources.items():
            target = OUT / f"{name}.{lang}.json"
            existing = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
            merged = merge(english, existing)
            if not report_only:
                target.write_text(
                    json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            filled = sum(1 for v in merged.values() if v)
            total += len(merged)
            done += filled
            gap = len(merged) - filled
            flag = "" if gap == 0 else f"   {gap} to translate"
            print(f"  {name + '.' + lang:34} {filled:4}/{len(merged):<4}{flag}")

    print(f"\n  {done}/{total} strings translated ({total - done} remaining)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

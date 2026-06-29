#!/usr/bin/env python3
"""Optimize the deployed site's fonts: convert TTF -> woff2 and rewrite @font-face.

Why this exists: Claude Design exports self-hosted .ttf fonts (~11 MB). woff2 is
60-80% smaller with no visual difference, so the live site loads far faster. Because a
fresh Claude Design export overwrites site/, this script is re-runnable: after refreshing
site/ from a new export, run it again to re-apply the optimization.

Usage:
    python3 scripts/optimize-site-fonts.py

Requires: fonttools, brotli  (pip install fonttools brotli)
Idempotent: if there are no .ttf files left, it does nothing.
"""
from pathlib import Path
import re
import sys

REPO = Path(__file__).resolve().parent.parent
SITE = REPO / "site"


def find_fonts_dirs():
    """Every fonts/ directory under the deployed design system."""
    return sorted(p for p in SITE.glob("_ds/*/fonts") if p.is_dir())


def convert_ttfs(fonts_dir: Path):
    from fontTools.ttLib import TTFont

    converted, saved = 0, 0
    for ttf in sorted(fonts_dir.glob("*.ttf")):
        woff2 = ttf.with_suffix(".woff2")
        before = ttf.stat().st_size
        font = TTFont(str(ttf))
        font.flavor = "woff2"
        font.save(str(woff2))
        after = woff2.stat().st_size
        ttf.unlink()
        converted += 1
        saved += before - after
        print(f"  {ttf.name:42} {before//1024:5} KB -> {after//1024:4} KB")
    return converted, saved


def rewrite_css(ds_dir: Path):
    changed = 0
    for css in ds_dir.rglob("*.css"):
        text = css.read_text()
        if ".ttf" not in text and 'format("truetype")' not in text:
            continue
        new = text.replace('.ttf")', '.woff2")').replace(
            'format("truetype")', 'format("woff2")'
        )
        if new != text:
            css.write_text(new)
            changed += 1
            print(f"  rewrote {css.relative_to(SITE)}")
    return changed


def main():
    fonts_dirs = find_fonts_dirs()
    if not fonts_dirs:
        print("No deployed fonts/ directory found under site/_ds/. Nothing to do.")
        return 0
    total_conv, total_saved, total_css = 0, 0, 0
    for fonts_dir in fonts_dirs:
        ds_dir = fonts_dir.parent
        print(f"Design system: {ds_dir.relative_to(SITE)}")
        conv, saved = convert_ttfs(fonts_dir)
        total_conv += conv
        total_saved += saved
        if conv:
            total_css += rewrite_css(ds_dir)
    if total_conv == 0:
        print("Already optimized — no .ttf files found.")
    else:
        print(
            f"\nConverted {total_conv} fonts, rewrote {total_css} CSS files, "
            f"saved ~{total_saved // (1024*1024)} MB."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

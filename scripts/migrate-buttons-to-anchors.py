#!/usr/bin/env python3
"""One-time migration step: turn the SPA's onClick nav buttons into real anchors.

Run against site/index.html while the Claude Design runtime is still in place. The
prerender pass that follows captures the hydrated DOM, so the anchors need to carry
real hrefs before that snapshot is taken.
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "site" / "index.html"

# goX handler -> route directory. Home is the site root.
ROUTES = {
    "goHome": "",
    "goNew": "new/",
    "goMass": "mass/",
    "goAbout": "about/",
    "goSacraments": "sacraments/",
    "goFormation": "formation/",
    "goGiving": "giving/",
    "goWatch": "watch/",
    "goContact": "contact/",
    "goSJB": "sjb/",
    "goIC": "ic/",
    "goSjbHistory": "sjb-history/",
    "goIcHistory": "ic-history/",
    "goPrayer": "prayer/",
    "give": "giving/",
}

html = SRC.read_text()
before = html

# 1. Give navLinks() an href so the nav and mobile drawer can render anchors.
html = html.replace(
    """    return items.map(([id, label]) => ({
      id,
      label,""",
    """    return items.map(([id, label]) => ({
      id,
      label,
      href: id + '/',""",
    1,
)

# 2. Rewrite <button ... onClick="{{ goX }}" ...>  ->  <a href="..." ...>
def button_to_anchor(m):
    # The named group is group 2, so the trailing attributes are group 3.
    attrs = m.group(1) + m.group(3)
    handler = m.group("handler")
    href = "./" if ROUTES[handler] == "" else ROUTES[handler]
    attrs = re.sub(r'\s*type="button"', "", attrs)
    attrs = re.sub(r'\s*style="background:none;border:0;cursor:pointer;padding:0"', "", attrs)
    return f'<a href="{href}"{attrs}>'


pattern = re.compile(
    r'<button([^>]*?)onClick="\{\{ (?P<handler>' + "|".join(ROUTES) + r') \}\}"([^>]*?)>'
)
html, n_btn = pattern.subn(button_to_anchor, html)

# 3. The nav loop and drawer loop use link.onClick.
html, n_nav = re.subn(
    r'<button class="\{\{ (link\.(?:cls|drawerCls)) \}\}" onClick="\{\{ link\.onClick \}\}">',
    r'<a href="{{ link.href }}" class="{{ \1 }}">',
    html,
)

# 4. The register CTA scrolls within the New Here? page rather than navigating.
html, n_anchor = re.subn(
    r'<button([^>]*?)onClick="\{\{ goRegisterSection \}\}"([^>]*?)>',
    r'<a href="#register-section"\1\2>',
    html,
)

# 5. Close the converted buttons. Every <a ...> opened above needs </a> not </button>.
#    Walk the document and rebalance, since buttons and anchors can nest neither way.
out, depth_stack, i = [], [], 0
tag_re = re.compile(r"</?(?:a|button)\b[^>]*>", re.I)
pos = 0
for m in tag_re.finditer(html):
    out.append(html[pos:m.start()])
    tag = m.group(0)
    if tag.lower().startswith("</"):
        kind = depth_stack.pop() if depth_stack else "button"
        out.append(f"</{kind}>")
    else:
        kind = "a" if tag.lower().startswith("<a") else "button"
        depth_stack.append(kind)
        out.append(tag)
    pos = m.end()
out.append(html[pos:])
html = "".join(out)

if html == before:
    sys.exit("no changes made - check the patterns")

SRC.write_text(html)
print(f"nav buttons -> anchors: {n_btn}")
print(f"nav loop links -> anchors: {n_nav}")
print(f"in-page register anchor: {n_anchor}")
print(f"remaining onClick handlers: {html.count('onClick=')}")

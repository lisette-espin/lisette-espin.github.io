#!/usr/bin/env python3
"""Optional. Squashes the folder into one self-contained HTML file.

You do not need this to run or publish the site — index.html works as it is,
from disk and from any host. It is only useful when you must hand someone a
single file (an email attachment, a chat window, an upload form that takes
one file).

    python3 make_single.py [out.html]
"""

import base64
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "lespin-dashboard-standalone.html")

html = (HERE / "index.html").read_text(encoding="utf-8")

MIME = {".jpg": "image/jpeg", ".png": "image/png", ".ico": "image/x-icon"}


def data_uri(rel):
    data = (HERE / rel).read_bytes()
    mime = MIME.get(Path(rel).suffix.lower(), "application/octet-stream")
    return f"data:{mime};base64," + base64.b64encode(data).decode()


def inline_image(rel):
    return data_uri(rel)


# the record, with its images turned into data URIs
raw = (HERE / "data" / "dashboard.js").read_text(encoding="utf-8")
record = json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))

if record["profile"].get("headshot", "").startswith("assets/"):
    record["profile"]["headshot"] = inline_image(record["profile"]["headshot"])
for group in (record.get("tools", []), record.get("podcasts", [])):
    for item in group:
        if item.get("image", "").startswith("assets/"):
            item["image"] = inline_image(item["image"])
meta = record.setdefault("meta", {})
if meta.get("ogImage", "").startswith("assets/"):
    meta["ogImage"] = inline_image(meta["ogImage"])
# the icon files will not sit beside a standalone file either
meta["icons"] = [
    dict(spec, href=data_uri(spec["href"]))
    for spec in (
        {"rel": "icon", "href": "assets/favicon.ico", "sizes": "any"},
        {"rel": "icon", "type": "image/png", "sizes": "32x32", "href": "assets/favicon-32.png"},
        {"rel": "apple-touch-icon", "href": "assets/apple-touch-icon.png"},
    )
    if (HERE / spec["href"]).exists()
]

html = html.replace(
    '<link rel="stylesheet" href="css/style.css">',
    "<style>\n" + (HERE / "css" / "style.css").read_text(encoding="utf-8") + "\n</style>")
html = html.replace(
    '<script src="data/dashboard.js"></script>',
    "<script>window.DASHBOARD = " + json.dumps(record, ensure_ascii=False) + ";</script>")
html = html.replace(
    '<script src="js/app.js"></script>',
    "<script>\n" + (HERE / "js" / "app.js").read_text(encoding="utf-8") + "\n</script>")
OUT.write_text(html, encoding="utf-8")
print(f"{OUT}  ({os.path.getsize(OUT)/1024:.0f} KB)")
